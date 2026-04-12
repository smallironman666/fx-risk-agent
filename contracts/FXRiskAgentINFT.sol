// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "openzeppelin-contracts/contracts/token/ERC721/ERC721.sol";

/**
 * @title FXRiskAgentINFT
 * @notice ERC-7857 启发的 AI Agent 身份 NFT (Intelligent NFT)
 * @dev 基于 ERC-721 扩展，每个 NFT 代表一个 FX Risk Agent 的链上身份。
 *      元数据通过 0G Storage 的 rootHash 引用，每次推理后可更新状态。
 * @author 0xSmallironman
 */
contract FXRiskAgentINFT is ERC721 {
    uint256 private _nextTokenId;

    /// @notice Agent 元数据结构
    struct AgentMetadata {
        string agentName;           // Agent 名称，如 "FX Risk Agent v0.1"
        string version;             // 版本号，如 "0.1.0"
        string modelType;           // 模型类型："inference" / "oracle"
        bytes32 storageRootHash;    // 0G Storage 根哈希，指向完整元数据 JSON
        uint256 createdAt;          // 创建区块时间戳
        address creator;            // 创建者钱包地址
    }

    /// @dev tokenId → 元数据
    mapping(uint256 => AgentMetadata) public agentMetadata;

    /// @dev tokenId → 累计推理次数
    mapping(uint256 => uint256) public inferenceCount;

    /// @dev tokenId → 最后更新时间
    mapping(uint256 => uint256) public lastUpdatedAt;

    /// @notice Agent 铸造事件
    event AgentMinted(
        uint256 indexed tokenId,
        address indexed creator,
        string agentName,
        string version,
        bytes32 storageRootHash,
        uint256 timestamp
    );

    /// @notice Agent 状态更新事件（每次推理后触发）
    event AgentStateUpdated(
        uint256 indexed tokenId,
        bytes32 newStorageRootHash,
        uint256 inferenceCount,
        uint256 timestamp
    );

    constructor() ERC721("FX Risk Agent INFT", "FXAGENT") {}

    /**
     * @notice 铸造一个新的 Agent INFT
     * @param to           接收者地址
     * @param agentName    Agent 名称
     * @param version      版本号
     * @param modelType    模型类型
     * @param storageRootHash 0G Storage 中元数据 JSON 的根哈希
     * @return tokenId     新铸造的 token ID
     */
    function mintAgent(
        address to,
        string calldata agentName,
        string calldata version,
        string calldata modelType,
        bytes32 storageRootHash
    ) external returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);

        agentMetadata[tokenId] = AgentMetadata({
            agentName: agentName,
            version: version,
            modelType: modelType,
            storageRootHash: storageRootHash,
            createdAt: block.timestamp,
            creator: msg.sender
        });

        emit AgentMinted(tokenId, msg.sender, agentName, version, storageRootHash, block.timestamp);
        return tokenId;
    }

    /**
     * @notice 更新 Agent 状态（每次推理或关键事件后调用）
     * @param tokenId              Agent ID
     * @param newStorageRootHash   新的 0G Storage 根哈希
     */
    function updateAgentState(uint256 tokenId, bytes32 newStorageRootHash) external {
        require(_ownerOf(tokenId) == msg.sender, "Not agent owner");
        agentMetadata[tokenId].storageRootHash = newStorageRootHash;
        inferenceCount[tokenId]++;
        lastUpdatedAt[tokenId] = block.timestamp;

        emit AgentStateUpdated(tokenId, newStorageRootHash, inferenceCount[tokenId], block.timestamp);
    }

    /**
     * @notice 查询 Agent 完整状态
     */
    function getAgent(uint256 tokenId)
        external
        view
        returns (
            AgentMetadata memory meta,
            uint256 totalInferences,
            uint256 lastUpdate
        )
    {
        require(_ownerOf(tokenId) != address(0), "Agent does not exist");
        return (agentMetadata[tokenId], inferenceCount[tokenId], lastUpdatedAt[tokenId]);
    }

    /**
     * @notice 查询当前总 Agent 数量
     */
    function totalSupply() external view returns (uint256) {
        return _nextTokenId;
    }
}
