// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/FXRiskAgentINFT.sol";

contract FXRiskAgentINFTTest is Test {
    FXRiskAgentINFT internal agentInft;

    address internal creator = address(0xA1);
    address internal stranger = address(0xB2);

    bytes32 internal constant META_HASH = bytes32(uint256(0x1234));

    function setUp() public {
        agentInft = new FXRiskAgentINFT();
    }

    // ============ Mint ============

    function test_mintAgent_incrementsTokenId() public {
        vm.prank(creator);
        uint256 tokenId1 = agentInft.mintAgent(creator, "Agent A", "v1", "fx", META_HASH);

        vm.prank(creator);
        uint256 tokenId2 = agentInft.mintAgent(creator, "Agent B", "v2", "fx", META_HASH);

        assertEq(tokenId1, 0, "first tokenId should be 0");
        assertEq(tokenId2, 1, "second tokenId should be 1");
        assertEq(agentInft.totalSupply(), 2, "totalSupply should match mint count");
    }

    function test_mintAgent_storesMetadataCorrectly() public {
        vm.prank(creator);
        uint256 tokenId = agentInft.mintAgent(creator, "FX Risk Agent", "v0.2.0", "fx-risk-inference", META_HASH);

        (FXRiskAgentINFT.AgentMetadata memory meta, uint256 inferenceCount, uint256 lastUpdate) =
            agentInft.getAgent(tokenId);

        assertEq(meta.agentName, "FX Risk Agent");
        assertEq(meta.version, "v0.2.0");
        assertEq(meta.modelType, "fx-risk-inference");
        assertEq(meta.storageRootHash, META_HASH);
        assertEq(meta.creator, creator);
        assertEq(inferenceCount, 0, "inferenceCount should start at 0");
        assertEq(lastUpdate, 0, "lastUpdate should start at 0");
    }

    function test_mintAgent_emitsAgentMintedEvent() public {
        vm.expectEmit(true, true, false, true);
        emit FXRiskAgentINFT.AgentMinted(0, creator, "Agent A", "v1", META_HASH, block.timestamp);

        vm.prank(creator);
        agentInft.mintAgent(creator, "Agent A", "v1", "fx", META_HASH);
    }

    function test_mintAgent_assignsOwnership() public {
        vm.prank(creator);
        uint256 tokenId = agentInft.mintAgent(creator, "Agent", "v1", "fx", META_HASH);

        assertEq(agentInft.ownerOf(tokenId), creator);
    }

    // ============ Update State ============

    function test_updateAgentState_incrementsInferenceCount() public {
        vm.prank(creator);
        uint256 tokenId = agentInft.mintAgent(creator, "Agent", "v1", "fx", META_HASH);

        bytes32 newHash = bytes32(uint256(0x5678));

        vm.prank(creator);
        agentInft.updateAgentState(tokenId, newHash);

        assertEq(agentInft.inferenceCount(tokenId), 1);

        vm.prank(creator);
        agentInft.updateAgentState(tokenId, newHash);

        assertEq(agentInft.inferenceCount(tokenId), 2);
    }

    function test_updateAgentState_updatesRootHash() public {
        vm.prank(creator);
        uint256 tokenId = agentInft.mintAgent(creator, "Agent", "v1", "fx", META_HASH);

        bytes32 newHash = bytes32(uint256(0xABCDEF));

        vm.prank(creator);
        agentInft.updateAgentState(tokenId, newHash);

        (FXRiskAgentINFT.AgentMetadata memory meta, , ) = agentInft.getAgent(tokenId);
        assertEq(meta.storageRootHash, newHash, "rootHash should be updated");
    }

    function test_updateAgentState_revertsIfNotOwner() public {
        vm.prank(creator);
        uint256 tokenId = agentInft.mintAgent(creator, "Agent", "v1", "fx", META_HASH);

        bytes32 newHash = bytes32(uint256(0x999));

        vm.prank(stranger);
        vm.expectRevert("Not agent owner");
        agentInft.updateAgentState(tokenId, newHash);
    }

    function test_updateAgentState_emitsEventWithCount() public {
        vm.prank(creator);
        uint256 tokenId = agentInft.mintAgent(creator, "Agent", "v1", "fx", META_HASH);

        bytes32 newHash = bytes32(uint256(0x111));

        vm.expectEmit(true, false, false, true);
        emit FXRiskAgentINFT.AgentStateUpdated(tokenId, newHash, 1, block.timestamp);

        vm.prank(creator);
        agentInft.updateAgentState(tokenId, newHash);
    }

    // ============ Get Agent ============

    function test_getAgent_revertsForNonExistentToken() public {
        vm.expectRevert("Agent does not exist");
        agentInft.getAgent(999);
    }
}
