// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/FXRiskOracle.sol";

contract DeployScript is Script {
    function run() external {
        vm.startBroadcast();
        FXRiskOracle oracle = new FXRiskOracle();
        console.log("FXRiskOracle deployed to:", address(oracle));
        vm.stopBroadcast();
    }
}
