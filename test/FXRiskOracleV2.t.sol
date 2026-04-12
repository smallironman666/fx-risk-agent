// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/FXRiskOracleV2.sol";

contract FXRiskOracleV2Test is Test {
    FXRiskOracleV2 internal oracle;

    address internal agentContract = address(0xAAAA);
    address internal reporter = address(0xBBBB);

    bytes32 internal constant ROOT_HASH_1 = bytes32(uint256(0x1111));
    bytes32 internal constant ROOT_HASH_2 = bytes32(uint256(0x2222));

    function setUp() public {
        oracle = new FXRiskOracleV2(agentContract);
    }

    // ============ Constructor ============

    function test_constructor_setsAgentContract() public view {
        assertEq(oracle.agentContract(), agentContract);
    }

    function test_constructor_revertsOnZeroAddress() public {
        vm.expectRevert("agentContract is zero");
        new FXRiskOracleV2(address(0));
    }

    // ============ Submit Alert ============

    function test_submitAlert_storesAllFields() public {
        vm.prank(reporter);
        oracle.submitAlert(
            "USD/CNY",
            FXRiskOracleV2.RiskLevel.HIGH,
            7_250_000,
            7_350_000,
            ROOT_HASH_1,
            0,
            "doubao"
        );

        (
            string memory pair,
            FXRiskOracleV2.RiskLevel level,
            uint256 rate,
            uint256 threshold,
            bytes32 rootHash,
            uint256 timestamp,
            address rep,
            uint256 agentTokenId,
            string memory backend
        ) = oracle.alerts(0);

        assertEq(pair, "USD/CNY");
        assertEq(uint256(level), uint256(FXRiskOracleV2.RiskLevel.HIGH));
        assertEq(rate, 7_250_000);
        assertEq(threshold, 7_350_000);
        assertEq(rootHash, ROOT_HASH_1);
        assertGt(timestamp, 0);
        assertEq(rep, reporter);
        assertEq(agentTokenId, 0);
        assertEq(backend, "doubao");
    }

    function test_submitAlert_updatesLatestRiskLevel() public {
        vm.prank(reporter);
        oracle.submitAlert(
            "USD/CNY",
            FXRiskOracleV2.RiskLevel.LOW,
            7_250_000,
            7_350_000,
            ROOT_HASH_1,
            0,
            "doubao"
        );
        assertEq(uint256(oracle.latestRiskLevel("USD/CNY")), uint256(FXRiskOracleV2.RiskLevel.LOW));

        vm.prank(reporter);
        oracle.submitAlert(
            "USD/CNY",
            FXRiskOracleV2.RiskLevel.CRITICAL,
            7_400_000,
            7_350_000,
            ROOT_HASH_2,
            0,
            "doubao"
        );
        assertEq(uint256(oracle.latestRiskLevel("USD/CNY")), uint256(FXRiskOracleV2.RiskLevel.CRITICAL));
    }

    function test_submitAlert_incrementsAlertCountByAgent() public {
        vm.prank(reporter);
        oracle.submitAlert("USD/CNY", FXRiskOracleV2.RiskLevel.LOW, 7_250_000, 7_350_000, ROOT_HASH_1, 0, "doubao");

        vm.prank(reporter);
        oracle.submitAlert("EUR/USD", FXRiskOracleV2.RiskLevel.HIGH, 1_080_000, 1_120_000, ROOT_HASH_1, 0, "doubao");

        vm.prank(reporter);
        oracle.submitAlert("GBP/USD", FXRiskOracleV2.RiskLevel.LOW, 1_260_000, 1_300_000, ROOT_HASH_1, 1, "0g-compute");

        assertEq(oracle.alertCountByAgent(0), 2, "agent 0 should have 2 alerts");
        assertEq(oracle.alertCountByAgent(1), 1, "agent 1 should have 1 alert");
    }

    function test_submitAlert_emitsEventWithAllFields() public {
        vm.expectEmit(true, true, false, true);
        emit FXRiskOracleV2.AlertCreated(
            0,
            "USD/CNY",
            FXRiskOracleV2.RiskLevel.HIGH,
            7_250_000,
            ROOT_HASH_1,
            block.timestamp,
            0,
            "doubao"
        );

        vm.prank(reporter);
        oracle.submitAlert("USD/CNY", FXRiskOracleV2.RiskLevel.HIGH, 7_250_000, 7_350_000, ROOT_HASH_1, 0, "doubao");
    }

    // ============ Query ============

    function test_getAlertCount_returnsCorrectCount() public {
        assertEq(oracle.getAlertCount(), 0);

        vm.prank(reporter);
        oracle.submitAlert("USD/CNY", FXRiskOracleV2.RiskLevel.LOW, 7_250_000, 7_350_000, ROOT_HASH_1, 0, "doubao");
        assertEq(oracle.getAlertCount(), 1);

        vm.prank(reporter);
        oracle.submitAlert("EUR/USD", FXRiskOracleV2.RiskLevel.HIGH, 1_080_000, 1_120_000, ROOT_HASH_1, 0, "doubao");
        assertEq(oracle.getAlertCount(), 2);
    }

    function test_getLatestAlerts_returnsRequestedCount() public {
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(reporter);
            oracle.submitAlert(
                "USD/CNY",
                FXRiskOracleV2.RiskLevel.LOW,
                7_250_000 + i * 1000,
                7_350_000,
                bytes32(i + 1),
                0,
                "doubao"
            );
        }

        FXRiskOracleV2.RiskAlert[] memory latest = oracle.getLatestAlerts(3);
        assertEq(latest.length, 3);

        // 最新3条应该是 index 2, 3, 4
        assertEq(latest[0].spotRate, 7_250_000 + 2 * 1000);
        assertEq(latest[1].spotRate, 7_250_000 + 3 * 1000);
        assertEq(latest[2].spotRate, 7_250_000 + 4 * 1000);
    }

    function test_getLatestAlerts_clampsToAvailableCount() public {
        vm.prank(reporter);
        oracle.submitAlert("USD/CNY", FXRiskOracleV2.RiskLevel.LOW, 7_250_000, 7_350_000, ROOT_HASH_1, 0, "doubao");

        // 请求10条，只有1条可用，应返回1条
        FXRiskOracleV2.RiskAlert[] memory latest = oracle.getLatestAlerts(10);
        assertEq(latest.length, 1);
    }

    // ============ Multiple Backends ============

    function test_submitAlert_supportsMultipleBackends() public {
        vm.prank(reporter);
        oracle.submitAlert("USD/CNY", FXRiskOracleV2.RiskLevel.LOW, 7_250_000, 7_350_000, ROOT_HASH_1, 0, "doubao");

        vm.prank(reporter);
        oracle.submitAlert("EUR/USD", FXRiskOracleV2.RiskLevel.HIGH, 1_080_000, 1_120_000, ROOT_HASH_1, 0, "0g-compute");

        (, , , , , , , , string memory backend0) = oracle.alerts(0);
        (, , , , , , , , string memory backend1) = oracle.alerts(1);

        assertEq(backend0, "doubao");
        assertEq(backend1, "0g-compute");
    }
}
