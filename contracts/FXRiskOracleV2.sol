// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "openzeppelin-contracts/contracts/token/ERC721/IERC721.sol";

/**
 * @title FXRiskOracleV2
 * @notice V2 版本的 FX 风险预警注册表，支持 Agent ID 关联 + AI 后端标识
 * @dev 相比 V1 新增字段：agentTokenId、aiBackend
 *      与 V1 共存（V1 保留历史数据），V2 为主写入合约
 *      访问控制：submitAlert 要求 msg.sender 是 agentTokenId 对应 INFT 的 owner
 * @author 0xSmallironman
 */
contract FXRiskOracleV2 {

    enum RiskLevel { LOW, MEDIUM, HIGH, CRITICAL }

    /// @notice getLatestAlerts 单次查询上限，防 DoS
    uint256 public constant MAX_QUERY_COUNT = 100;

    struct RiskAlert {
        string    currencyPair;     // e.g. "USD/CNY"
        RiskLevel level;
        uint256   spotRate;         // 6-decimal fixed point
        uint256   threshold;
        bytes32   storageRootHash;  // 0G Storage 中完整决策日志的 root
        uint256   timestamp;
        address   reporter;         // Agent wallet
        uint256   agentTokenId;     // INFT tokenId（V2 新增）
        string    aiBackend;        // "doubao" / "0g-compute"（V2 新增）
    }

    /// @notice Agent INFT 合约地址（immutable，部署时固定）
    address public immutable agentContract;

    RiskAlert[] public alerts;

    /// @notice 每个货币对的最新风险等级
    mapping(string => RiskLevel) public latestRiskLevel;

    /// @notice 每个 AgentID 产生的 alert 数量
    mapping(uint256 => uint256) public alertCountByAgent;

    /// @notice Alert 上链事件
    /// @dev 包含完整 alert 字段，让 indexer / Dashboard 不必再做额外 storage 读取
    event AlertCreated(
        uint256 indexed alertId,
        string  currencyPair,
        RiskLevel level,
        uint256 spotRate,
        uint256 threshold,           // V2.1 新增：触发阈值，方便 indexer 直接显示
        bytes32 storageRootHash,
        uint256 timestamp,
        uint256 indexed agentTokenId,
        address indexed reporter,    // V2.1 新增：indexed 报告人，便于按 wallet 过滤
        string  aiBackend
    );

    constructor(address _agentContract) {
        require(_agentContract != address(0), "agentContract is zero");
        agentContract = _agentContract;
    }

    /**
     * @notice 提交一条 AI 风险预警
     * @param currencyPair     货币对
     * @param level            风险等级
     * @param spotRate         即期汇率 (6 位小数定点数)
     * @param threshold        触发阈值
     * @param storageRootHash  0G Storage 决策日志的 rootHash
     * @param agentTokenId     Agent INFT 的 tokenId
     * @param aiBackend        AI 后端标识 ("doubao" / "0g-compute")
     */
    function submitAlert(
        string calldata currencyPair,
        RiskLevel level,
        uint256 spotRate,
        uint256 threshold,
        bytes32 storageRootHash,
        uint256 agentTokenId,
        string calldata aiBackend
    ) external {
        // 访问控制：只有 agentTokenId 对应 INFT 的 owner 才能提交预警
        // 防止任意地址伪造 AI 决策，保护"可信 AI"卖点
        require(
            IERC721(agentContract).ownerOf(agentTokenId) == msg.sender,
            "FXRiskOracleV2: caller not agent owner"
        );

        uint256 alertId = alerts.length;

        alerts.push(RiskAlert({
            currencyPair: currencyPair,
            level: level,
            spotRate: spotRate,
            threshold: threshold,
            storageRootHash: storageRootHash,
            timestamp: block.timestamp,
            reporter: msg.sender,
            agentTokenId: agentTokenId,
            aiBackend: aiBackend
        }));

        latestRiskLevel[currencyPair] = level;
        alertCountByAgent[agentTokenId] += 1;

        emit AlertCreated(
            alertId,
            currencyPair,
            level,
            spotRate,
            threshold,
            storageRootHash,
            block.timestamp,
            agentTokenId,
            msg.sender,
            aiBackend
        );
    }

    function getAlertCount() external view returns (uint256) {
        return alerts.length;
    }

    function getLatestAlerts(uint256 count) external view returns (RiskAlert[] memory) {
        // 防 DoS：限制单次返回数量，避免 gas 耗尽
        require(count <= MAX_QUERY_COUNT, "FXRiskOracleV2: count exceeds max");

        uint256 total = alerts.length;
        if (count > total) count = total;

        RiskAlert[] memory result = new RiskAlert[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = alerts[total - count + i];
        }
        return result;
    }
}
