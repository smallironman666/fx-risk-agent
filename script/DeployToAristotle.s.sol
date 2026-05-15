// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/FXRiskAgentINFT.sol";
import "../contracts/FXRiskOracleV2.sol";

/**
 * @title DeployToAristotleScript
 * @notice Aristotle 主网（Chain ID 16661）一键部署：先 INFT 再 Oracle，
 *         保证 Oracle 构造函数参数 agentContract 已就绪。
 *
 * 用法：
 *   export PRIVATE_KEY=0x...
 *   export OG_RPC_URL=https://evmrpc.0g.ai            # Aristotle 主网
 *   forge script script/DeployToAristotle.s.sol \
 *       --rpc-url $OG_RPC_URL \
 *       --broadcast \
 *       --legacy \
 *       --with-gas-price 3000000000
 *
 * 部署完成后输出两个地址，按提示写入 .env：
 *   AGENT_INFT_ADDRESS=...
 *   FX_RISK_ORACLE_V2_ADDRESS=...
 */
contract DeployToAristotleScript is Script {
    function run() external {
        vm.startBroadcast();

        // Step 1: INFT 合约（agent 身份）
        FXRiskAgentINFT agentINFT = new FXRiskAgentINFT();
        console.log("FXRiskAgentINFT deployed to:", address(agentINFT));

        // Step 2: Oracle V2（依赖 INFT 做访问控制）
        FXRiskOracleV2 oracleV2 = new FXRiskOracleV2(address(agentINFT));
        console.log("FXRiskOracleV2  deployed to:", address(oracleV2));
        console.log("                linked to:  ", address(agentINFT));

        vm.stopBroadcast();

        console.log("");
        console.log("=== Next steps ===");
        console.log("1. Update .env:");
        console.log("   AGENT_INFT_ADDRESS=", address(agentINFT));
        console.log("   FX_RISK_ORACLE_V2_ADDRESS=", address(oracleV2));
        console.log("2. Mint Token #0 via: npm run mint-agent");
        console.log("3. Verify both contracts on Aristotle Chainscan.");
    }
}
