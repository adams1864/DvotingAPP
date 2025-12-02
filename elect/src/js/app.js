/**
 * Governance Voting DApp
 * Features: Voter Delegation, Time-Based Voting, Quadratic Voting
 */
App = {
  web3Provider: null,
  web3: null,
  contracts: {},
  account: null,
  contractInstance: null,
  timerInterval: null,
  phaseLabels: ["Setup", "Voting", "Finished"],
  isPaused: false,
  historyLimit: 8,
  eventSource: null,
  networkId: null,
  explorerBases: {
    1: "https://etherscan.io/tx/",
    5: "https://goerli.etherscan.io/tx/",
    11155111: "https://sepolia.etherscan.io/tx/"
  },

  // ============ INITIALIZATION ============

  init: async function () {
    return App.initWeb3();
  },

  initWeb3: async function () {
    if (window.ethereum) {
      App.web3Provider = window.ethereum;
      try {
        await window.ethereum.request({ method: "eth_requestAccounts" });
      } catch (error) {
        App.setStatus("Wallet access denied. Please connect MetaMask.");
        return;
      }
    } else if (window.web3) {
      App.web3Provider = window.web3.currentProvider;
    } else {
      App.web3Provider = new Web3.providers.HttpProvider("http://127.0.0.1:7545");
      App.setStatus("No wallet detected. Using local Ganache.");
    }

    App.web3 = new Web3(App.web3Provider);
    // Expose to legacy code paths
    window.web3 = App.web3;
    try {
      if (App.web3.eth && App.web3.eth.net && App.web3.eth.net.getId) {
        App.networkId = await App.web3.eth.net.getId();
      } else if (App.web3.version && App.web3.version.network) {
        App.networkId = parseInt(App.web3.version.network, 10);
      }
    } catch (error) {
      console.warn("Unable to detect network id", error);
    }
    return App.initContract();
  },

  initContract: async function () {
    try {
      const data = await $.getJSON("GovernanceVoting.json");
      App.contracts.GovernanceVoting = TruffleContract(data);
      App.contracts.GovernanceVoting.setProvider(App.web3Provider);
      App.contractInstance = await App.contracts.GovernanceVoting.deployed();
      if (App.web3 && App.web3.eth && typeof App.web3.eth.Contract === "function") {
        App.eventSource = new App.web3.eth.Contract(data.abi, App.contractInstance.address);
      } else {
        App.eventSource = App.contractInstance; // fallback for legacy web3
      }

      await App.loadAccount();
      App.bindEvents();
      return App.refreshState();
    } catch (error) {
      App.setStatus("Failed to load contract. Make sure you ran 'truffle migrate --reset'");
      console.error(error);
    }
  },

  loadAccount: async function () {
    let accounts = [];
    if (window.ethereum && window.ethereum.request) {
      try {
        accounts = await window.ethereum.request({ method: "eth_accounts" });
        if (!accounts || accounts.length === 0) {
          accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        }
      } catch (error) {
        App.setStatus("Wallet access denied");
        throw error;
      }
    }

    if (!accounts || accounts.length === 0) {
      accounts = await App.web3.eth.getAccounts();
    }

    if (!accounts || accounts.length === 0) {
      App.account = null;
      $("#accountAddress").text("No wallet connected");
      App.setStatus("Connect MetaMask to participate");
      throw new Error("No accounts available");
    }

    App.account = accounts[0];
    $("#accountAddress").text(App.formatAddress(App.account));
    App.setStatus("Connected");
  },

  bindEvents: function () {
    $("#addProposalForm").on("submit", App.handleAddProposal);
    $("#whitelistForm").on("submit", App.handleWhitelist);
    $("#delegateForm").on("submit", App.handleDelegate);
    $("#removeDelegateBtn").on("click", App.handleRemoveDelegate);
    $("#startVotingBtn").on("click", App.handleStartVoting);
    $("#closeVotingBtn").on("click", App.handleCloseVoting);
    $("#pauseElectionBtn").on("click", App.handlePauseElection);
    $("#resumeElectionBtn").on("click", App.handleResumeElection);
    $("#voteBtn").on("click", App.handleVote);
    $("#historyRefreshBtn").on("click", App.refreshHistory);

    if (window.ethereum && window.ethereum.on) {
      window.ethereum.on("accountsChanged", async () => {
        await App.loadAccount();
        App.refreshState();
      });
    }
  },

  // ============ STATE REFRESH ============

  refreshState: async function () {
    try {
      const instance = App.contractInstance;
      
      // Get election info
      const electionName = await instance.electionName();
      $("#electionName").text(electionName);
      
      // Get phase
      const phaseId = (await instance.phase()).toNumber();
      const phaseLabel = App.phaseLabels[phaseId] || "Unknown";
      $("#phaseLabel").text(phaseLabel).attr("data-phase", phaseId);
      
      // Get admin
      const admin = await instance.admin();
      const isAdmin = App.account && admin.toLowerCase() === App.account.toLowerCase();
      const role = isAdmin ? "Admin" : "Voter";
      
      $("#accountRole").text(role).attr("data-role", role.toLowerCase());
      $("#adminActions").toggle(isAdmin);
      const paused = await instance.paused();
      App.isPaused = paused;
      App.updatePauseUI(paused, isAdmin);
      
      // Show/hide based on phase
      App.updateUIForPhase(phaseId, isAdmin);
      
      // Update timer for voting phase
      App.updateTimer(instance, phaseId);
      
      // Render data
      await App.renderProposals(instance, phaseId);
      await App.renderVoterStatus(instance, phaseId);
      
      if (phaseId === 2) {
        await App.renderResults(instance);
      }
      await App.refreshHistory();
      
    } catch (error) {
      console.error("refreshState error:", error);
      App.setStatus(error.message || "Unable to read contract state");
    }
  },

  updateUIForPhase: function (phaseId, isAdmin) {
    // Setup phase
    if (phaseId === 0) {
      $("#durationGroup").show();
      $("#startVotingBtn").show();
      $("#closeVotingBtn").hide();
      $("#votingCard").show();
      $("#resultsCard").hide();
      $("#delegationCard").toggle(!isAdmin);
    }
    // Voting phase
    else if (phaseId === 1) {
      $("#durationGroup").hide();
      $("#startVotingBtn").hide();
      $("#closeVotingBtn").show();
      $("#votingCard").show();
      $("#resultsCard").hide();
      $("#delegationCard").hide();
      $("#timerSection").show();
    }
    // Finished phase
    else {
      $("#durationGroup").hide();
      $("#startVotingBtn").hide();
      $("#closeVotingBtn").hide();
      $("#votingCard").hide();
      $("#resultsCard").show();
      $("#delegationCard").hide();
      $("#timerSection").hide();
    }
  },

  updatePauseUI: function (paused, isAdmin) {
    const statusEl = $("#systemStatus");
    if (paused) {
      statusEl.text("Paused by Admin").removeClass("active").addClass("paused");
    } else {
      statusEl.text("Operational").removeClass("paused").addClass("active");
    }

    $("#pauseBanner").toggle(paused);
    $(".pause-sensitive").prop("disabled", paused);

    if (isAdmin) {
      $("#pauseElectionBtn").toggle(!paused);
      $("#resumeElectionBtn").toggle(paused);
    } else {
      $("#pauseElectionBtn, #resumeElectionBtn").hide();
    }
  },

  updateTimer: async function (instance, phaseId) {
    if (App.timerInterval) {
      clearInterval(App.timerInterval);
      App.timerInterval = null;
    }

    if (phaseId !== 1) {
      $("#timerSection").hide();
      return;
    }

    try {
      const timeInfo = await instance.getTimeInfo();
      // Handle both object and array style returns
      const endTimeBN = timeInfo.endTime || timeInfo[2];
      const endTime = endTimeBN ? endTimeBN.toNumber() : 0;
      
      if (endTime === 0) {
        $("#timerSection").hide();
        return;
      }

      $("#timerSection").show();
      
      App.timerInterval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = endTime - now;

      if (remaining <= 0) {
        $("#timeRemaining").text("ENDED").addClass("expired");
        clearInterval(App.timerInterval);
        return;
      }

      const hours = Math.floor(remaining / 3600);
      const mins = Math.floor((remaining % 3600) / 60);
      const secs = remaining % 60;
      const formatted = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      
      $("#timeRemaining").text(formatted).removeClass("expired");
    }, 1000);
    } catch (error) {
      console.error("Timer error:", error);
      $("#timerSection").hide();
    }
  },

  // ============ RENDER FUNCTIONS ============

  renderProposals: async function (instance, phaseId) {
    const tbody = $("#proposalsTable tbody");
    const select = $("#proposalSelect");
    tbody.empty();
    select.empty();
    select.append('<option value="">-- Choose a proposal --</option>');

    const count = (await instance.proposalCount()).toNumber();
    $("#proposalCount").text(`${count} proposal${count !== 1 ? 's' : ''}`);

    for (let i = 0; i < count; i++) {
      const proposal = await instance.getProposal(i);
      const title = proposal.title || proposal[0];
      const quadVotes = proposal.quadraticVotes || proposal[2];
      const rawVotes = proposal.rawVotes || proposal[3];
      
      const row = `
        <tr>
          <td>${i + 1}</td>
          <td>${title}</td>
          <td><span class="vote-count quadratic">${quadVotes.toString()}</span></td>
          <td><span class="vote-count raw">${rawVotes.toString()}</span></td>
        </tr>
      `;
      tbody.append(row);
      select.append(`<option value="${i}">${title}</option>`);
    }

    if (count === 0) {
      tbody.append('<tr><td colspan="4" class="text-center">No proposals yet</td></tr>');
    }
  },

  renderVoterStatus: async function (instance, phaseId) {
    if (!App.account) {
      App.setStatus("Connect wallet to continue");
      return;
    }

    try {
      const voter = await instance.getVoter(App.account);
      const whitelisted = voter.whitelisted || voter[0];
      const weight = (voter.weight || voter[1]).toString();
      const voted = voter.voted || voter[2];
      const votedProposalId = (voter.votedProposalId || voter[3]).toNumber();
      const delegate = voter.delegate || voter[4];
      const delegatedWeight = (voter.delegatedWeight || voter[5]).toString();
      const totalPower = (voter.totalVotingPower || voter[6]).toString();

      // Update voter stats
      $("#voterWeight").text(weight);
      $("#delegatedWeight").text(delegatedWeight);
      $("#totalPower").text(totalPower);
      
      // Calculate and show quadratic power
      const quadPower = App.calculateQuadratic(parseInt(totalPower));
      $("#quadraticPower").text(quadPower);

      // Delegation status
      if (delegate && delegate !== "0x0000000000000000000000000000000000000000") {
        $("#delegationStatus").text("Delegated to " + App.formatAddress(delegate));
        $("#removeDelegateBtn").show();
        $("#delegateForm").hide();
      } else {
        $("#delegationStatus").text("None");
        $("#removeDelegateBtn").hide();
        $("#delegateForm").show();
      }

      // Vote status
      if (voted) {
        const proposal = await instance.getProposal(votedProposalId);
        $("#voteStatus").text(`Voted for: ${proposal.title || proposal[0]}`).addClass("voted");
        App.setStatus(`You voted for "${proposal.title || proposal[0]}" with ${quadPower} quadratic votes`);
      } else if (!whitelisted) {
        $("#voteStatus").text("Not whitelisted");
        App.setStatus("You are not whitelisted for this election");
      } else {
        $("#voteStatus").text("Ready to vote");
        App.setStatus("You can cast your vote");
      }

      // Enable/disable vote button
      const canVote = whitelisted && !voted && phaseId === 1 && 
              (!delegate || delegate === "0x0000000000000000000000000000000000000000") &&
              !App.isPaused;
      $("#voteBtn").prop("disabled", !canVote);

    } catch (error) {
      console.error("renderVoterStatus error:", error);
      App.setStatus("Unable to fetch voter info");
    }
  },

  renderResults: async function (instance) {
    try {
      const winner = await instance.winningProposal();
      
      // Handle both object and array style returns from contract
      const winnerId = (winner.proposalId || winner[0]).toNumber();
      const title = winner.title || winner[1];
      const quadVotes = (winner.quadraticVotes || winner[2]).toString();
      const rawVotes = (winner.rawVotes || winner[3]).toString();

      $("#winnerTitle").text(title);
      $("#winnerQuadratic").text(quadVotes);
      $("#winnerRaw").text(rawVotes);

      // Show all results
      const allResults = $("#allResults");
      allResults.empty();
      
      const count = (await instance.proposalCount()).toNumber();
      for (let i = 0; i < count; i++) {
        const proposal = await instance.getProposal(i);
        const pTitle = proposal.title || proposal[0];
        const pQuad = (proposal.quadraticVotes || proposal[2]).toString();
        const pRaw = (proposal.rawVotes || proposal[3]).toString();
        const isWinner = i === winnerId;
        
        const resultItem = `
          <div class="result-item ${isWinner ? 'winner' : ''}">
            <span class="result-title">${pTitle}</span>
            <span class="result-votes">${pQuad} votes (${pRaw} raw)</span>
          </div>
        `;
        allResults.append(resultItem);
      }

    } catch (error) {
      console.error("renderResults error:", error);
      $("#winnerTitle").text("Unable to compute results");
    }
  },

  // ============ EVENT HANDLERS ============

  handleAddProposal: async function (event) {
    event.preventDefault();
    const title = $("#proposalTitle").val().trim();
    const description = $("#proposalDescription").val().trim();
    
    if (!title) {
      return App.setFeedback("Enter a proposal title", true);
    }
    if (App.isPaused) {
      return App.setFeedback("Election is paused. Resume before modifying proposals.", true);
    }
    
    try {
      App.setFeedback("Adding proposal...", false);
      await App.contractInstance.addProposal(title, description, { from: App.account });
      $("#proposalTitle").val("");
      $("#proposalDescription").val("");
      App.setFeedback("Proposal added successfully!", false);
      App.refreshState();
    } catch (error) {
      App.setFeedback(App.extractError(error), true);
    }
  },

  handleWhitelist: async function (event) {
    event.preventDefault();
    const address = $("#whitelistAddress").val().trim();
    const weight = parseInt($("#voterWeightInput").val(), 10);
    
    if (!App.isValidAddress(address)) {
      return App.setFeedback("Enter a valid Ethereum address", true);
    }
    if (!weight || weight <= 0) {
      return App.setFeedback("Weight must be greater than zero", true);
    }
    if (App.isPaused) {
      return App.setFeedback("Election is paused. Resume before whitelisting voters.", true);
    }

    try {
      App.setFeedback("Whitelisting voter...", false);
      await App.contractInstance.whitelistVoter(address, weight, { from: App.account });
      $("#whitelistAddress").val("");
      App.setFeedback(`Voter whitelisted with ${weight} credits (${App.calculateQuadratic(weight)} quadratic votes)`, false);
      App.refreshState();
    } catch (error) {
      App.setFeedback(App.extractError(error), true);
    }
  },

  handleDelegate: async function (event) {
    event.preventDefault();
    const delegateAddress = $("#delegateAddress").val().trim();
    
    if (!App.isValidAddress(delegateAddress)) {
      return App.setFeedback("Enter a valid delegate address", true);
    }
    if (App.isPaused) {
      return App.setFeedback("Election is paused. Delegation is temporarily disabled.", true);
    }

    try {
      App.setFeedback("Delegating vote...", false);
      await App.contractInstance.delegate(delegateAddress, { from: App.account });
      $("#delegateAddress").val("");
      App.setFeedback("Vote delegated successfully!", false);
      App.refreshState();
    } catch (error) {
      App.setFeedback(App.extractError(error), true);
    }
  },

  handleRemoveDelegate: async function () {
    if (App.isPaused) {
      return App.setFeedback("Election is paused. Resume before changing delegation.", true);
    }
    try {
      App.setFeedback("Removing delegation...", false);
      await App.contractInstance.removeDelegate({ from: App.account });
      App.setFeedback("Delegation removed", false);
      App.refreshState();
    } catch (error) {
      App.setFeedback(App.extractError(error), true);
    }
  },

  handleStartVoting: async function () {
    const duration = parseInt($("#votingDuration").val(), 10);
    
    if (!duration || duration <= 0) {
      return App.setFeedback("Enter a valid voting duration", true);
    }
    if (App.isPaused) {
      return App.setFeedback("Election is paused. Resume before starting or modifying phases.", true);
    }

    try {
      App.setFeedback("Starting voting phase...", false);
      await App.contractInstance.startVoting(duration, { from: App.account });
      App.setFeedback(`Voting started for ${duration} minutes!`, false);
      App.refreshState();
    } catch (error) {
      App.setFeedback(App.extractError(error), true);
    }
  },

  handleCloseVoting: async function () {
    if (App.isPaused) {
      return App.setFeedback("Election is paused. Resume before closing voting.", true);
    }
    try {
      App.setFeedback("Closing voting...", false);
      await App.contractInstance.closeVoting({ from: App.account });
      App.setFeedback("Voting closed. See results below!", false);
      App.refreshState();
    } catch (error) {
      App.setFeedback(App.extractError(error), true);
    }
  },

  handlePauseElection: async function () {
    try {
      App.setFeedback("Pausing election...", false);
      await App.contractInstance.pauseElection({ from: App.account });
      App.setFeedback("Election paused successfully.", false);
      App.refreshState();
    } catch (error) {
      App.setFeedback(App.extractError(error), true);
    }
  },

  handleResumeElection: async function () {
    try {
      App.setFeedback("Resuming election...", false);
      await App.contractInstance.resumeElection({ from: App.account });
      App.setFeedback("Election resumed.", false);
      App.refreshState();
    } catch (error) {
      App.setFeedback(App.extractError(error), true);
    }
  },

  handleVote: async function () {
    const proposalId = $("#proposalSelect").val();
    
    if (proposalId === "" || proposalId === null) {
      return App.setFeedback("Select a proposal first", true);
    }
    if (App.isPaused) {
      return App.setFeedback("Election is paused. Voting will resume once unpaused.", true);
    }

    try {
      App.setFeedback("Submitting vote...", false);
      await App.contractInstance.vote(proposalId, { from: App.account });
      App.setFeedback("Vote submitted successfully!", false);
      App.refreshState();
    } catch (error) {
      App.setFeedback(App.extractError(error), true);
    }
  },

  refreshHistory: async function () {
    const timeline = $("#historyTimeline");
    if (!timeline.length) return;
    const source = App.eventSource;
    if (!source) {
      timeline.html('<p class="history-error">History unavailable: contract not ready.</p>');
      return;
    }

    timeline.html('<p class="history-empty">Loading history...</p>');

    try {
      const events = await App.fetchContractEvents(source);

      if (!events || events.length === 0) {
        timeline.html('<p class="history-empty">No activity recorded yet.</p>');
        return;
      }

      events.sort((a, b) => b.blockNumber - a.blockNumber);
      const latest = events.slice(0, App.historyLimit);
      const enriched = await Promise.all(latest.map(App.enrichEvent));

      timeline.empty();
      enriched.forEach((entry) => {
        const hashPreview = entry.hash ? entry.hash.substring(0, 10) + "..." : "";
        const html = `
          <div class="history-entry">
            <div class="history-meta">
              <span class="history-event">${entry.action}</span>
              <span class="history-time">${entry.time}</span>
            </div>
            <div class="history-details">
              <span class="history-actor">By ${entry.actor}</span>
              <a class="history-link" href="${entry.link}" target="_blank" rel="noopener">Tx ${hashPreview}</a>
            </div>
          </div>`;
        timeline.append(html);
      });
    } catch (error) {
      console.error("History error:", error);
      timeline.html('<p class="history-error">Unable to load history.</p>');
    }
  },

  fetchContractEvents: async function (source) {
    if (typeof source.getPastEvents === "function") {
      let latestBlock = 0;
      if (App.web3 && App.web3.eth && App.web3.eth.getBlockNumber) {
        try {
          latestBlock = await App.web3.eth.getBlockNumber();
        } catch (err) {
          console.warn("Unable to read latest block", err);
        }
      }
      const fromBlock = latestBlock && latestBlock > 2000 ? latestBlock - 2000 : 0;
      return source.getPastEvents("allEvents", {
        fromBlock,
        toBlock: "latest"
      });
    }
    if (typeof source.allEvents === "function") {
      return App.fetchLegacyEvents(source);
    }
    throw new Error("Contract events not supported in this environment");
  },

  fetchLegacyEvents: function (source) {
    return new Promise((resolve, reject) => {
      try {
        source
          .allEvents({ fromBlock: 0, toBlock: "latest" })
          .get((error, logs) => {
            if (error) return reject(error);
            const normalized = (logs || []).map(App.normalizeLegacyEvent);
            resolve(normalized);
          });
      } catch (err) {
        reject(err);
      }
    });
  },

  normalizeLegacyEvent: function (log) {
    return {
      event: log.event,
      returnValues: log.args || {},
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash
    };
  },

  enrichEvent: async function (event) {
    try {
      const [block, tx] = await Promise.all([
        App.web3.eth.getBlock(event.blockNumber),
        App.web3.eth.getTransaction(event.transactionHash)
      ]);
      const timestamp = block && block.timestamp
        ? new Date(block.timestamp * 1000).toLocaleString()
        : "-";
      const actor = tx && tx.from ? App.formatAddress(tx.from) : "Unknown";
      return {
        action: App.describeEvent(event),
        time: timestamp,
        actor,
        hash: event.transactionHash || "",
        link: App.buildExplorerLink(event.transactionHash)
      };
    } catch (error) {
      console.error("enrichEvent error", error);
      return {
        action: App.describeEvent(event),
        time: "-",
        actor: "Unknown",
        hash: event.transactionHash || "",
        link: App.buildExplorerLink(event.transactionHash)
      };
    }
  },

  describeEvent: function (event) {
    const values = event.returnValues || {};
    switch (event.event) {
      case "ElectionCreated":
        return `Election Created: ${values.name || values[0] || ""}`;
      case "ProposalAdded":
        return `Proposal Added: ${values.title || values[1] || ""}`;
      case "VoterWhitelisted":
        return `Voter Whitelisted: ${App.formatAddress(values.account || values[0])}`;
      case "VoteDelegated":
        return `Delegation Updated (${App.formatAddress(values.from || values[0])} → ${App.formatAddress(values.to || values[1])})`;
      case "Voted":
        return `Vote Cast by ${App.formatAddress(values.account || values[0])}`;
      case "VotingStarted":
        return "Voting Window Opened";
      case "VotingEnded": {
        const winnerId = values.winningProposalId || values[0];
        return `Voting Closed: Winner #${winnerId ? winnerId.toString() : "-"}`;
      }
      case "Paused":
        return "Election Paused";
      case "Unpaused":
        return "Election Resumed";
      default:
        return event.event || "Contract Interaction";
    }
  },

  buildExplorerLink: function (hash) {
    if (!hash) return "#";
    const base = App.explorerBases[App.networkId] || "https://etherscan.io/tx/";
    return base + hash;
  },

  // ============ UTILITY FUNCTIONS ============

  calculateQuadratic: function (weight) {
    if (weight <= 0) return 0;
    return Math.floor(Math.sqrt(weight));
  },

  isValidAddress: function (address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  },

  formatAddress: function (address) {
    if (!address) return "-";
    return address.substring(0, 6) + "..." + address.substring(38);
  },

  extractError: function (error) {
    if (error.message) {
      // Check for specific revert reasons
      if (error.message.includes("Voting is not active")) {
        return "Voting is not currently active";
      }
      if (error.message.includes("Voting has not started")) {
        return "Voting has not started yet";
      }
      if (error.message.includes("Voting period has ended")) {
        return "Voting period has ended";
      }
      if (error.message.includes("Not whitelisted") || error.message.includes("not a whitelisted")) {
        return "You are not whitelisted for this election";
      }
      if (error.message.includes("Already voted") || error.message.includes("already voted")) {
        return "You have already voted";
      }
      if (error.message.includes("delegated")) {
        return "You have delegated your vote to someone else";
      }
      if (error.message.includes("revert")) {
        const match = error.message.match(/revert (.+)/);
        return match ? match[1] : "Transaction reverted by contract";
      }
      if (error.message.includes("User denied")) {
        return "Transaction cancelled by user";
      }
      if (error.message.includes("Internal JSON-RPC error")) {
        return "Transaction failed - check if you are whitelisted and haven't voted yet";
      }
      return error.message;
    }
    return "Transaction failed";
  },

  setFeedback: function (message, isError) {
    const el = $("#voterFeedback");
    el.text(message || "");
    el.removeClass("success error");
    el.addClass(isError ? "error" : "success");
  },

  setStatus: function (message) {
    $("#accountStatus").text(message);
  }
};

// Initialize on page load
$(function () {
  $(window).on("load", function () {
    App.init();
  });
});
