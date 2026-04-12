// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title FXRiskOracleV2
 * @notice V2 版本的 FX 风险预警注册表，支持 Agent ID 关联 + AI 后端标识
 * @dev 相比 V1 新增字段：agentTokenId、aiBackend
 *      与 V1 共存（V1 保留历史数据），V2 为主写入合约
 * @author 0xSmallironman
 */
contract FXRiskOracleV2 {

    enum RiskLevel { LOW, MEDIUM, HIGH, CRITICAL }

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

    event AlertCreated(
        uint256 indexed alertId,
        string  currencyPair,
        RiskLevel level,
        uint256 spotRate,
        bytes32 storageRootHash,
        uint256 timestamp,
        uint256 indexed agentTokenId,
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
            storageRootHash,
            block.timestamp,
            agentTokenId,
            aiBackend
        );
    }

    function getAlertCount() external view returns (uint256) {
        return alerts.length;
    }

    function getLatestAlerts(uint256 count) external view returns (RiskAlert[] memory) {
        uint256 total = alerts.length;
        if (count > total) count = total;

        RiskAlert[] memory result = new RiskAlert[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = alerts[total - count + i];
        }
        return result;
    }
}
