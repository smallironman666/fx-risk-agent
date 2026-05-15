// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "openzeppelin-contracts/contracts/token/ERC721/ERC721.sol";
import "openzeppelin-contracts/contracts/access/Ownable.sol";
import "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import "openzeppelin-contracts/contracts/utils/Base64.sol";
import "openzeppelin-contracts/contracts/utils/Strings.sol";

/**
 * @title FXRiskAgentINFT
 * @notice ERC-7857 启发的 AI Agent 身份 NFT (Intelligent NFT)
 * @dev 基于 ERC-721 扩展，每个 NFT 代表一个 FX Risk Agent 的链上身份。
 *      元数据通过 0G Storage 的 rootHash 引用，每次推理后可更新状态。
 *      访问控制：仅合约 owner 可 mint，防止伪造"官方" Agent 身份。
 *      重入保护：mint/updateAgentState 加 nonReentrant，防御恶意 ERC721Receiver。
 * @author 0xSmallironman
 */
contract FXRiskAgentINFT is ERC721, Ownable, ReentrancyGuard {
    uint256 private _nextTokenId;

    /// @notice Agent 元数据结构
    struct AgentMetadata {
        string agentName;           // Agent 名称，如 "FX Risk Agent v0.1"
        string version;             // 版本号，如 "0.1.0"
        string modelType;           // 模型类型："inference" / "oracle"
        bytes32 storageRootHash;    // 0G Storage 根哈希，指向完整元数据 JSON
        uint256 createdAt;          // 创建区块时间戳
        address creator;            // Agent 所有人（NFT 接收方）
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

    constructor()
        ERC721("FX Risk Agent INFT", "FXAGENT")
        Ownable(msg.sender)
    {}

    /**
     * @notice 铸造一个新的 Agent INFT（仅合约 owner 可调）
     * @param to           接收者地址（同时是记录中的 creator）
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
    ) external onlyOwner nonReentrant returns (uint256) {
        uint256 tokenId = _nextTokenId++;

        // 先写 metadata 再外调，防御重入顺序
        agentMetadata[tokenId] = AgentMetadata({
            agentName: agentName,
            version: version,
            modelType: modelType,
            storageRootHash: storageRootHash,
            createdAt: block.timestamp,
            creator: to
        });

        _safeMint(to, tokenId);

        emit AgentMinted(tokenId, to, agentName, version, storageRootHash, block.timestamp);
        return tokenId;
    }

    /**
     * @notice 更新 Agent 状态（每次推理或关键事件后调用）
     * @param tokenId              Agent ID
     * @param newStorageRootHash   新的 0G Storage 根哈希
     */
    function updateAgentState(uint256 tokenId, bytes32 newStorageRootHash)
        external
        nonReentrant
    {
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

    /**
     * @notice 链上生成 token metadata（data URI 形式，钱包/Chainscan 可直接渲染）
     * @dev 包含动态 SVG（按 inferenceCount 变化）+ JSON traits。无依赖外部 IPFS。
     *      "Memory as Asset" 叙事：转让 INFT = 转让该 Agent 的全部链上推理历史。
     *      内部拆 _buildJsonHead / _buildJsonTraits 避免 stack-too-deep。
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Agent does not exist");

        bytes memory json = abi.encodePacked(
            _buildJsonHead(tokenId),
            _buildJsonTraits(tokenId)
        );

        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(json)));
    }

    /// @dev JSON 头部：name + description + image，访存 agentMetadata 和 inferenceCount
    function _buildJsonHead(uint256 tokenId) internal view returns (string memory) {
        AgentMetadata memory meta = agentMetadata[tokenId];
        string memory svg = _renderSigil(tokenId, inferenceCount[tokenId]);
        return string(
            abi.encodePacked(
                '{"name":"', meta.agentName, ' #', Strings.toString(tokenId),
                '","description":"Verifiable AI Agent for FX risk monitoring on 0G Network. Every inference is permanently archived on 0G Storage and recorded on 0G Chain. Transfer of this INFT transfers the full audit trail.",',
                '"image":"data:image/svg+xml;base64,', Base64.encode(bytes(svg)), '",'
            )
        );
    }

    /// @dev JSON traits 数组 + 闭合，单独抽出限制本函数 stack 深度
    function _buildJsonTraits(uint256 tokenId) internal view returns (string memory) {
        AgentMetadata memory meta = agentMetadata[tokenId];
        return string(
            abi.encodePacked(
                '"attributes":[',
                    '{"trait_type":"Version","value":"', meta.version, '"},',
                    '{"trait_type":"Model Type","value":"', meta.modelType, '"},',
                    '{"trait_type":"Total Inferences","value":', Strings.toString(inferenceCount[tokenId]), '},',
                    '{"trait_type":"Created At","display_type":"date","value":', Strings.toString(meta.createdAt), '},',
                    '{"trait_type":"Last Update","display_type":"date","value":', Strings.toString(lastUpdatedAt[tokenId]), '},',
                    '{"trait_type":"Standard","value":"ERC-7857 Inspired INFT"}',
                ']}'
            )
        );
    }

    /**
     * @notice 渲染 Agent 的 sigil（链上 SVG）
     * @dev 设计：0G 紫色品牌 + 单色极简 + tokenId 大字 + 推理次数随时间递增
     *      Pure 函数：仅依赖入参，方便测试 + 节省 storage 读
     */
    function _renderSigil(uint256 tokenId, uint256 inferences) internal pure returns (string memory) {
        string memory tokenIdStr = Strings.toString(tokenId);
        string memory inferencesStr = Strings.toString(inferences);

        return string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">',
                '<rect width="400" height="400" fill="#0a0c10"/>',
                '<circle cx="200" cy="200" r="140" fill="none" stroke="#B75FFF" stroke-width="2" stroke-dasharray="4 4" opacity="0.4"/>',
                '<circle cx="200" cy="200" r="100" fill="none" stroke="#B75FFF" stroke-width="2"/>',
                '<text x="200" y="100" text-anchor="middle" font-family="monospace" font-size="11" fill="#6b7280" letter-spacing="3">ERC-7857 INFT</text>',
                '<text x="200" y="160" text-anchor="middle" font-family="monospace" font-size="13" fill="#B75FFF" letter-spacing="2">FX RISK AGENT</text>',
                '<text x="200" y="230" text-anchor="middle" font-family="monospace" font-size="64" font-weight="700" fill="#e4e7ef">#', tokenIdStr, '</text>',
                '<text x="200" y="270" text-anchor="middle" font-family="monospace" font-size="11" fill="#6b7280">ON-CHAIN INFERENCES</text>',
                '<text x="200" y="296" text-anchor="middle" font-family="monospace" font-size="22" font-weight="600" fill="#22c55e">', inferencesStr, '</text>',
                '<text x="200" y="370" text-anchor="middle" font-family="monospace" font-size="10" fill="#6b7280" letter-spacing="2">BUILT ON 0G</text>',
                '</svg>'
            )
        );
    }
}
