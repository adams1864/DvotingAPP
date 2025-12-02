// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title GovernanceVoting
 * @notice A governance voting system with:
 *   - Voter Delegation: Voters can delegate their voting power to another voter
 *   - Time-Based Voting: Voting starts and ends automatically based on timestamps
 *   - Quadratic Voting: Vote power = sqrt(weight), preventing whale dominance
 */
contract GovernanceVoting is Pausable {
    
    // ============ DATA STRUCTURES ============
    
    struct Proposal {
        string title;
        string description;
        uint256 voteCount;      // Total quadratic votes received
        uint256 rawVoteCount;   // Total raw weight (for comparison display)
    }

    struct Voter {
        bool whitelisted;
        uint256 weight;           // Voting credits (tokens)
        bool voted;
        uint256 votedProposalId;
        address delegate;         // Who this voter delegated to (address(0) if none)
        uint256 delegatedWeight;  // Extra weight received from delegators
    }

    enum Phase {
        Setup,      // Admin adds proposals and whitelists voters
        Voting,     // Voters cast ballots (time-based)
        Finished    // Voting closed, results available
    }

    // ============ STATE VARIABLES ============
    
    address public immutable admin;
    string public electionName;
    Phase public phase;
    
    // Time-based voting
    uint256 public votingStartTime;
    uint256 public votingEndTime;
    
    // Proposals and voters
    Proposal[] private _proposals;
    mapping(address => Voter) private _voters;
    address[] private _voterAddresses; // Track all whitelisted addresses
    
    // ============ EVENTS ============
    
    event ElectionCreated(string name, address admin);
    event ProposalAdded(uint256 indexed proposalId, string title);
    event VoterWhitelisted(address indexed account, uint256 weight);
    event VoteDelegated(address indexed from, address indexed to, uint256 weight);
    event Voted(address indexed account, uint256 indexed proposalId, uint256 quadraticVotes, uint256 rawWeight);
    event VotingStarted(uint256 startTime, uint256 endTime);
    event VotingEnded(uint256 winningProposalId, string winningTitle);
    
    // ============ MODIFIERS ============
    
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can perform this action");
        _;
    }

    modifier inPhase(Phase expected) {
        require(phase == expected, "Action not allowed in current phase");
        _;
    }
    
    modifier votingOpen() {
        require(phase == Phase.Voting, "Voting is not active");
        require(block.timestamp >= votingStartTime, "Voting has not started yet");
        require(block.timestamp <= votingEndTime, "Voting period has ended");
        _;
    }

    // ============ CONSTRUCTOR ============
    
    constructor(string memory _electionName, string[] memory proposalTitles) {
        admin = msg.sender;
        electionName = _electionName;
        phase = Phase.Setup;
        
        // Add initial proposals
        for (uint256 i = 0; i < proposalTitles.length; i++) {
            _addProposal(proposalTitles[i], "");
        }
        
        emit ElectionCreated(_electionName, msg.sender);
    }

    // ============ VIEW FUNCTIONS ============
    
    function proposalCount() external view returns (uint256) {
        return _proposals.length;
    }

    function getProposal(uint256 proposalId) external view returns (
        string memory title,
        string memory description,
        uint256 quadraticVotes,
        uint256 rawVotes
    ) {
        require(proposalId < _proposals.length, "Invalid proposal ID");
        Proposal storage prop = _proposals[proposalId];
        return (prop.title, prop.description, prop.voteCount, prop.rawVoteCount);
    }

    function getVoter(address account) external view returns (
        bool whitelisted,
        uint256 weight,
        bool voted,
        uint256 votedProposalId,
        address delegateAddress,
        uint256 delegatedWeight,
        uint256 totalVotingPower
    ) {
        Voter storage voter = _voters[account];
        uint256 total = voter.weight + voter.delegatedWeight;
        return (
            voter.whitelisted,
            voter.weight,
            voter.voted,
            voter.votedProposalId,
            voter.delegate,
            voter.delegatedWeight,
            total
        );
    }
    
    function getTimeInfo() external view returns (
        uint256 currentTime,
        uint256 startTime,
        uint256 endTime,
        bool isVotingActive
    ) {
        bool active = phase == Phase.Voting && 
                      block.timestamp >= votingStartTime && 
                      block.timestamp <= votingEndTime;
        return (block.timestamp, votingStartTime, votingEndTime, active);
    }
    
    function getVoterCount() external view returns (uint256) {
        return _voterAddresses.length;
    }

    // Calculate quadratic vote power: sqrt(weight)
    // We use integer square root for simplicity
    function calculateQuadraticVotes(uint256 weight) public pure returns (uint256) {
        if (weight == 0) return 0;
        if (weight == 1) return 1;
        
        // Babylonian method for integer square root
        uint256 x = weight;
        uint256 y = (x + 1) / 2;
        while (y < x) {
            x = y;
            y = (weight / y + y) / 2;
        }
        return x;
    }

    // ============ ADMIN FUNCTIONS ============
    
    function addProposal(string memory title, string memory description) 
        external 
        onlyAdmin 
        inPhase(Phase.Setup) 
        whenNotPaused 
    {
        _addProposal(title, description);
    }

    function _addProposal(string memory title, string memory description) private {
        require(bytes(title).length > 0, "Proposal title cannot be empty");
        _proposals.push(Proposal({
            title: title,
            description: description,
            voteCount: 0,
            rawVoteCount: 0
        }));
        emit ProposalAdded(_proposals.length - 1, title);
    }

    function whitelistVoter(address account, uint256 weight) 
        external 
        onlyAdmin 
        inPhase(Phase.Setup) 
        whenNotPaused 
    {
        require(account != address(0), "Cannot whitelist zero address");
        require(weight > 0, "Weight must be greater than zero");
        require(account != admin, "Admin cannot be a voter");
        
        Voter storage voter = _voters[account];
        
        // If new voter, add to list
        if (!voter.whitelisted) {
            _voterAddresses.push(account);
        }
        
        voter.whitelisted = true;
        voter.weight = weight;
        voter.voted = false;
        voter.votedProposalId = 0;
        voter.delegate = address(0);
        voter.delegatedWeight = 0;
        
        emit VoterWhitelisted(account, weight);
    }

    function startVoting(uint256 durationInMinutes) 
        external 
        onlyAdmin 
        inPhase(Phase.Setup) 
        whenNotPaused 
    {
        require(_proposals.length > 0, "Add at least one proposal first");
        require(_voterAddresses.length > 0, "Whitelist at least one voter first");
        require(durationInMinutes > 0, "Duration must be greater than zero");
        
        phase = Phase.Voting;
        votingStartTime = block.timestamp;
        votingEndTime = block.timestamp + (durationInMinutes * 1 minutes);
        
        emit VotingStarted(votingStartTime, votingEndTime);
    }

    function closeVoting() external onlyAdmin inPhase(Phase.Voting) whenNotPaused {
        phase = Phase.Finished;
        
        uint256 winnerId = _calculateWinner();
        emit VotingEnded(winnerId, _proposals[winnerId].title);
    }
    
    // Auto-close if time expired (anyone can call)
    function finalizeIfExpired() external inPhase(Phase.Voting) whenNotPaused {
        require(block.timestamp > votingEndTime, "Voting period not yet ended");
        
        phase = Phase.Finished;
        
        uint256 winnerId = _calculateWinner();
        emit VotingEnded(winnerId, _proposals[winnerId].title);
    }

    /**
     * @notice Emergency circuit breaker controls
     */
    function pauseElection() external onlyAdmin {
        _pause();
    }

    function resumeElection() external onlyAdmin {
        _unpause();
    }

    // ============ VOTER FUNCTIONS ============
    
    /**
     * @notice Delegate your voting power to another whitelisted voter
     * @param to The address to delegate to
     */
    function delegate(address to) external inPhase(Phase.Setup) whenNotPaused {
        Voter storage sender = _voters[msg.sender];
        require(sender.whitelisted, "You are not a whitelisted voter");
        require(!sender.voted, "You have already voted");
        require(to != msg.sender, "Cannot delegate to yourself");
        require(to != address(0), "Cannot delegate to zero address");
        
        Voter storage delegateTo = _voters[to];
        require(delegateTo.whitelisted, "Delegate is not a whitelisted voter");
        
        // Remove previous delegation if exists
        if (sender.delegate != address(0)) {
            Voter storage oldDelegate = _voters[sender.delegate];
            oldDelegate.delegatedWeight -= sender.weight;
        }
        
        // Set new delegation
        sender.delegate = to;
        delegateTo.delegatedWeight += sender.weight;
        
        emit VoteDelegated(msg.sender, to, sender.weight);
    }
    
    /**
     * @notice Remove your delegation and reclaim voting power
     */
    function removeDelegate() external inPhase(Phase.Setup) whenNotPaused {
        Voter storage sender = _voters[msg.sender];
        require(sender.whitelisted, "You are not a whitelisted voter");
        require(sender.delegate != address(0), "You have not delegated");
        
        Voter storage oldDelegate = _voters[sender.delegate];
        oldDelegate.delegatedWeight -= sender.weight;
        
        emit VoteDelegated(msg.sender, address(0), sender.weight);
        sender.delegate = address(0);
    }

    /**
     * @notice Cast your vote using quadratic voting
     * @param proposalId The proposal to vote for
     */
    function vote(uint256 proposalId) external votingOpen whenNotPaused {
        require(proposalId < _proposals.length, "Invalid proposal ID");
        
        Voter storage voter = _voters[msg.sender];
        require(voter.whitelisted, "You are not a whitelisted voter");
        require(!voter.voted, "You have already voted");
        require(voter.delegate == address(0), "You have delegated your vote");
        
        // Calculate total voting power (own weight + delegated weight)
        uint256 totalWeight = voter.weight + voter.delegatedWeight;
        require(totalWeight > 0, "No voting power");
        
        // Calculate quadratic votes
        uint256 quadraticVotes = calculateQuadraticVotes(totalWeight);
        
        // Record vote
        voter.voted = true;
        voter.votedProposalId = proposalId;
        
        // Add votes to proposal
        _proposals[proposalId].voteCount += quadraticVotes;
        _proposals[proposalId].rawVoteCount += totalWeight;
        
        emit Voted(msg.sender, proposalId, quadraticVotes, totalWeight);
    }

    // ============ RESULTS ============
    
    function _calculateWinner() private view returns (uint256 winningId) {
        uint256 highestVotes = 0;
        for (uint256 i = 0; i < _proposals.length; i++) {
            if (_proposals[i].voteCount > highestVotes) {
                highestVotes = _proposals[i].voteCount;
                winningId = i;
            }
        }
    }

    function winningProposal() external view inPhase(Phase.Finished) returns (
        uint256 proposalId,
        string memory title,
        uint256 quadraticVotes,
        uint256 rawVotes
    ) {
        uint256 winnerId = _calculateWinner();
        Proposal storage winner = _proposals[winnerId];
        return (winnerId, winner.title, winner.voteCount, winner.rawVoteCount);
    }
    
    function getAllResults() external view inPhase(Phase.Finished) returns (
        string[] memory titles,
        uint256[] memory quadraticVotes,
        uint256[] memory rawVotes
    ) {
        uint256 len = _proposals.length;
        titles = new string[](len);
        quadraticVotes = new uint256[](len);
        rawVotes = new uint256[](len);
        
        for (uint256 i = 0; i < len; i++) {
            titles[i] = _proposals[i].title;
            quadraticVotes[i] = _proposals[i].voteCount;
            rawVotes[i] = _proposals[i].rawVoteCount;
        }
    }
}
