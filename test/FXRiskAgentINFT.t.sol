// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/FXRiskAgentINFT.sol";
import "openzeppelin-contracts/contracts/access/Ownable.sol";

contract FXRiskAgentINFTTest is Test {
    FXRiskAgentINFT internal agentInft;

    // owner = test contract (地址由 Foundry 决定)
    address internal creator = address(0xA1);
    address internal stranger = address(0xB2);

    bytes32 internal constant META_HASH = bytes32(uint256(0x1234));

    function setUp() public {
        // test contract 部署 → 自动成为 INFT 合约 owner
        agentInft = new FXRiskAgentINFT();
    }

    // ============ Mint (onlyOwner) ============

    function test_mintAgent_incrementsTokenId() public {
        uint256 tokenId1 = agentInft.mintAgent(creator, "Agent A", "v1", "fx", META_HASH);
        uint256 tokenId2 = agentInft.mintAgent(creator, "Agent B", "v2", "fx", META_HASH);

        assertEq(tokenId1, 0, "first tokenId should be 0");
        assertEq(tokenId2, 1, "second tokenId should be 1");
        assertEq(agentInft.totalSupply(), 2, "totalSupply should match mint count");
    }

    function test_mintAgent_storesMetadataCorrectly() public {
        uint256 tokenId = agentInft.mintAgent(creator, "FX Risk Agent", "v0.2.0", "fx-risk-inference", META_HASH);

        (FXRiskAgentINFT.AgentMetadata memory meta, uint256 inferenceCount, uint256 lastUpdate) =
            agentInft.getAgent(tokenId);

        assertEq(meta.agentName, "FX Risk Agent");
        assertEq(meta.version, "v0.2.0");
        assertEq(meta.modelType, "fx-risk-inference");
        assertEq(meta.storageRootHash, META_HASH);
        assertEq(meta.creator, creator, "creator should equal `to` param");
        assertEq(inferenceCount, 0, "inferenceCount should start at 0");
        assertEq(lastUpdate, 0, "lastUpdate should start at 0");
    }

    function test_mintAgent_emitsAgentMintedEvent() public {
        vm.expectEmit(true, true, false, true);
        emit FXRiskAgentINFT.AgentMinted(0, creator, "Agent A", "v1", META_HASH, block.timestamp);

        agentInft.mintAgent(creator, "Agent A", "v1", "fx", META_HASH);
    }

    function test_mintAgent_assignsOwnership() public {
        uint256 tokenId = agentInft.mintAgent(creator, "Agent", "v1", "fx", META_HASH);
        assertEq(agentInft.ownerOf(tokenId), creator);
    }

    function test_mintAgent_revertsWhenNotOwner() public {
        // stranger 非合约 owner，不应能 mint
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        agentInft.mintAgent(stranger, "Agent", "v1", "fx", META_HASH);
    }

    // ============ Update State ============

    function test_updateAgentState_incrementsInferenceCount() public {
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
        uint256 tokenId = agentInft.mintAgent(creator, "Agent", "v1", "fx", META_HASH);

        bytes32 newHash = bytes32(uint256(0xABCDEF));

        vm.prank(creator);
        agentInft.updateAgentState(tokenId, newHash);

        (FXRiskAgentINFT.AgentMetadata memory meta, , ) = agentInft.getAgent(tokenId);
        assertEq(meta.storageRootHash, newHash, "rootHash should be updated");
    }

    function test_updateAgentState_revertsIfNotOwner() public {
        uint256 tokenId = agentInft.mintAgent(creator, "Agent", "v1", "fx", META_HASH);

        bytes32 newHash = bytes32(uint256(0x999));

        vm.prank(stranger);
        vm.expectRevert("Not agent owner");
        agentInft.updateAgentState(tokenId, newHash);
    }

    function test_updateAgentState_emitsEventWithCount() public {
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

    // ============ Ownership (Ownable) ============

    function test_owner_defaultsToDeployer() public view {
        // setUp 里 test contract 部署 INFT，所以 test contract 是 owner
        assertEq(agentInft.owner(), address(this));
    }

    function test_transferOwnership_updatesOwner() public {
        address newOwner = address(0xC3);
        agentInft.transferOwnership(newOwner);
        assertEq(agentInft.owner(), newOwner);

        // 新 owner 能 mint
        vm.prank(newOwner);
        agentInft.mintAgent(creator, "Agent", "v1", "fx", META_HASH);

        // 老 owner (test contract) 不能 mint 了
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this))
        );
        agentInft.mintAgent(creator, "Agent2", "v1", "fx", META_HASH);
    }

    // ============ tokenURI (on-chain SVG + JSON) ============

    function test_tokenURI_revertsForNonExistentToken() public {
        vm.expectRevert("Agent does not exist");
        agentInft.tokenURI(999);
    }

    function test_tokenURI_returnsBase64DataUri() public {
        uint256 tokenId = agentInft.mintAgent(creator, "FX Risk Agent", "v0.2.0", "inference", META_HASH);
        string memory uri = agentInft.tokenURI(tokenId);

        // 必须是 data:application/json;base64, 前缀
        bytes memory uriBytes = bytes(uri);
        bytes memory expectedPrefix = bytes("data:application/json;base64,");
        assertGt(uriBytes.length, expectedPrefix.length, "uri should be longer than prefix");
        for (uint256 i = 0; i < expectedPrefix.length; i++) {
            assertEq(uriBytes[i], expectedPrefix[i], "tokenURI should start with data uri prefix");
        }
    }

    function test_tokenURI_changesAfterInference() public {
        // 动态 SVG：推理次数改变 → tokenURI 不同（"Memory as Asset" 叙事核心）
        uint256 tokenId = agentInft.mintAgent(creator, "Agent", "v1", "fx", META_HASH);
        string memory uriBefore = agentInft.tokenURI(tokenId);

        vm.prank(creator);
        agentInft.updateAgentState(tokenId, bytes32(uint256(0xBEEF)));

        string memory uriAfter = agentInft.tokenURI(tokenId);
        assertTrue(
            keccak256(bytes(uriBefore)) != keccak256(bytes(uriAfter)),
            "tokenURI should change after inference (dynamic metadata)"
        );
    }
}
