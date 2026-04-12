// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/FXRiskAgentINFT.sol";

contract DeployAgentINFTScript is Script {
    function run() external {
        vm.startBroadcast();

        FXRiskAgentINFT agentINFT = new FXRiskAgentINFT();

        console.log("FXRiskAgentINFT deployed to:", address(agentINFT));

        vm.stopBroadcast();
    }
}
