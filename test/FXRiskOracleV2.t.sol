// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/FXRiskOracleV2.sol";
import "../contracts/FXRiskAgentINFT.sol";

contract FXRiskOracleV2Test is Test {
    FXRiskOracleV2 internal oracle;
    FXRiskAgentINFT internal inft;

    address internal reporter = address(0xBBBB);
    address internal intruder = address(0xCCCC);

    bytes32 internal constant ROOT_HASH_1 = bytes32(uint256(0x1111));
    bytes32 internal constant ROOT_HASH_2 = bytes32(uint256(0x2222));

    function setUp() public {
        // 部署真实 INFT 合约，给 reporter mint tokenId=0 和 tokenId=1
        inft = new FXRiskAgentINFT();
        inft.mintAgent(reporter, "TestAgent0", "0.1.0", "inference", bytes32(uint256(0xABCD)));
        inft.mintAgent(reporter, "TestAgent1", "0.1.0", "inference", bytes32(uint256(0xABCE)));

        oracle = new FXRiskOracleV2(address(inft));
    }

    // ============ Constructor ============

    function test_constructor_setsAgentContract() public view {
        assertEq(oracle.agentContract(), address(inft));
    }

    function test_constructor_revertsOnZeroAddress() public {
        vm.expectRevert("agentContract is zero");
        new FXRiskOracleV2(address(0));
    }

    function test_constants_maxQueryCount() public view {
        assertEq(oracle.MAX_QUERY_COUNT(), 100);
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

    // ============ C1: Access Control ============

    function test_submitAlert_revertsWhenCallerNotAgentOwner() public {
        // intruder 没有 tokenId=0 的所有权
        vm.prank(intruder);
        vm.expectRevert("FXRiskOracleV2: caller not agent owner");
        oracle.submitAlert("USD/CNY", FXRiskOracleV2.RiskLevel.HIGH, 7_250_000, 7_350_000, ROOT_HASH_1, 0, "doubao");
    }

    function test_submitAlert_revertsWhenTokenDoesNotExist() public {
        // tokenId=99 从未 mint
        vm.prank(reporter);
        vm.expectRevert(); // OpenZeppelin ERC721NonexistentToken
        oracle.submitAlert("USD/CNY", FXRiskOracleV2.RiskLevel.HIGH, 7_250_000, 7_350_000, ROOT_HASH_1, 99, "doubao");
    }

    function test_submitAlert_allowsTransferredOwner() public {
        // reporter 把 tokenId=0 转给 intruder
        vm.prank(reporter);
        inft.transferFrom(reporter, intruder, 0);

        // 新 owner intruder 可以提交预警
        vm.prank(intruder);
        oracle.submitAlert("USD/CNY", FXRiskOracleV2.RiskLevel.HIGH, 7_250_000, 7_350_000, ROOT_HASH_1, 0, "doubao");

        // 原 owner reporter 不能再提交
        vm.prank(reporter);
        vm.expectRevert("FXRiskOracleV2: caller not agent owner");
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

    // ============ C2: DoS Protection ============

    function test_getLatestAlerts_revertsWhenCountExceedsMax() public {
        vm.expectRevert("FXRiskOracleV2: count exceeds max");
        oracle.getLatestAlerts(101);
    }

    function test_getLatestAlerts_allowsExactlyMaxCount() public view {
        // 当前无 alert，count=100 应合法（clamp 到 0）
        FXRiskOracleV2.RiskAlert[] memory latest = oracle.getLatestAlerts(100);
        assertEq(latest.length, 0);
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
