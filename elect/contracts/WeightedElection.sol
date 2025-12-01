// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

contract WeightedElection {
    struct Proposal {
        string title;
        uint256 voteCount;
    }

    struct Voter {
        bool whitelisted;
        uint256 weight;
        bool voted;
        uint256 vote;
    }

    enum Phase {
        Setup,
        Voting,
        Finished
    }

    address public immutable admin;
    Phase public phase;
    Proposal[] private _proposals;
    mapping(address => Voter) private _voters;

    event ProposalAdded(uint256 indexed proposalId, string title);
    event VoterWhitelisted(address indexed account, uint256 weight);
    event Voted(address indexed account, uint256 indexed proposalId, uint256 weight);
    event PhaseAdvanced(Phase newPhase);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    modifier inPhase(Phase expected) {
        require(phase == expected, "Wrong phase");
        _;
    }

    constructor(string[] memory proposalTitles) {
        admin = msg.sender;
        phase = Phase.Setup;
        for (uint256 i = 0; i < proposalTitles.length; i++) {
            _addProposal(proposalTitles[i]);
        }
    }

    function proposalCount() external view returns (uint256) {
        return _proposals.length;
    }

    function getProposal(uint256 proposalId) external view returns (string memory title, uint256 votes) {
        require(proposalId < _proposals.length, "Invalid proposal");
        Proposal storage prop = _proposals[proposalId];
        return (prop.title, prop.voteCount);
    }

    function getVoter(address account)
        external
        view
        returns (bool whitelisted, uint256 weight, bool voted, uint256 selectedProposal)
    {
        Voter storage voter = _voters[account];
        return (voter.whitelisted, voter.weight, voter.voted, voter.vote);
    }

    function addProposal(string memory title) external onlyAdmin inPhase(Phase.Setup) {
        _addProposal(title);
    }

    function _addProposal(string memory title) private {
        require(bytes(title).length > 0, "Empty title");
        _proposals.push(Proposal({title: title, voteCount: 0}));
        emit ProposalAdded(_proposals.length - 1, title);
    }

    function whitelistVoter(address account, uint256 weight) external onlyAdmin inPhase(Phase.Setup) {
        require(account != address(0), "Zero address");
        require(weight > 0, "Zero weight");
        Voter storage voter = _voters[account];
        voter.whitelisted = true;
        voter.weight = weight;
        voter.voted = false;
        voter.vote = 0;
        emit VoterWhitelisted(account, weight);
    }

    function startVoting() external onlyAdmin inPhase(Phase.Setup) {
        require(_proposals.length > 0, "No proposals");
        phase = Phase.Voting;
        emit PhaseAdvanced(phase);
    }

    function closeVoting() external onlyAdmin inPhase(Phase.Voting) {
        phase = Phase.Finished;
        emit PhaseAdvanced(phase);
    }

    function vote(uint256 proposalId) external inPhase(Phase.Voting) {
        require(proposalId < _proposals.length, "Invalid proposal");
        Voter storage voter = _voters[msg.sender];
        require(voter.whitelisted, "Not whitelisted");
        require(!voter.voted, "Already voted");

        voter.voted = true;
        voter.vote = proposalId;
        _proposals[proposalId].voteCount += voter.weight;

        emit Voted(msg.sender, proposalId, voter.weight);
    }

    function winningProposal() external view inPhase(Phase.Finished) returns (uint256 winningId) {
        uint256 highestVotes = 0;
        for (uint256 i = 0; i < _proposals.length; i++) {
            if (_proposals[i].voteCount > highestVotes) {
                highestVotes = _proposals[i].voteCount;
                winningId = i;
            }
        }
    }
}
