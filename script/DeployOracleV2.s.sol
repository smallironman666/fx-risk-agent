// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/FXRiskOracleV2.sol";

contract DeployOracleV2Script is Script {
    function run() external {
        address agentContract = vm.envAddress("AGENT_INFT_ADDRESS");
        require(agentContract != address(0), "AGENT_INFT_ADDRESS not set");

        vm.startBroadcast();
        FXRiskOracleV2 oracleV2 = new FXRiskOracleV2(agentContract);
        console.log("FXRiskOracleV2 deployed to:", address(oracleV2));
        console.log("Linked to AgentINFT:", agentContract);
        vm.stopBroadcast();
    }
}
