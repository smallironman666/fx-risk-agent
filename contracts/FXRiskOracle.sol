// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title FXRiskOracle
 * @notice AI-driven FX risk alert registry on 0G Chain.
 *         Each alert stores the 0G Storage root hash of the full AI decision log,
 *         creating an immutable, auditable on-chain trail.
 * @author 0xSmallironman
 */
contract FXRiskOracle {

    enum RiskLevel { LOW, MEDIUM, HIGH, CRITICAL }

    struct RiskAlert {
        string  currencyPair;    // e.g. "USD/CNY"
        RiskLevel level;
        uint256 spotRate;        // 6-decimal fixed point (1.0 = 1_000_000)
        uint256 threshold;       // breach threshold, same encoding
        bytes32 storageRootHash; // 0G Storage root hash of AI decision log
        uint256 timestamp;
        address reporter;        // agent wallet
    }

    RiskAlert[] public alerts;

    // 每个货币对的最新风险等级
    mapping(string => RiskLevel) public latestRiskLevel;

    event AlertCreated(
        uint256 indexed alertId,
        string  currencyPair,
        RiskLevel level,
        uint256 spotRate,
        bytes32 storageRootHash,
        uint256 timestamp
    );

    /**
     * @notice 记录一条AI风险预警
     * @param currencyPair  货币对标识
     * @param level         风险等级
     * @param spotRate      当前即期汇率 (6位小数定点数)
     * @param threshold     触发阈值
     * @param storageRootHash 0G Storage中完整决策日志的root hash
     */
    function submitAlert(
        string calldata currencyPair,
        RiskLevel level,
        uint256 spotRate,
        uint256 threshold,
        bytes32 storageRootHash
    ) external {
        uint256 alertId = alerts.length;

        alerts.push(RiskAlert({
            currencyPair: currencyPair,
            level: level,
            spotRate: spotRate,
            threshold: threshold,
            storageRootHash: storageRootHash,
            timestamp: block.timestamp,
            reporter: msg.sender
        }));

        latestRiskLevel[currencyPair] = level;

        emit AlertCreated(
            alertId,
            currencyPair,
            level,
            spotRate,
            storageRootHash,
            block.timestamp
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
