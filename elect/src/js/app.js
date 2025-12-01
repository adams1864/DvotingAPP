App = {
  web3Provider: null,
  contracts: {},
  account: null,
  phaseLabels: ["Setup", "Voting", "Finished"],

  init: async function () {
    return App.initWeb3();
  },

  initWeb3: async function () {
    if (window.ethereum) {
      App.web3Provider = window.ethereum;
      try {
        await window.ethereum.request({ method: "eth_requestAccounts" });
      } catch (error) {
        App.setStatus("Wallet access denied");
        return;
      }
    } else if (window.web3) {
      App.web3Provider = window.web3.currentProvider;
    } else {
      App.web3Provider = new Web3.providers.HttpProvider("http://127.0.0.1:7545");
      App.setStatus("Using fallback provider (Ganache @7545)");
    }

    web3 = new Web3(App.web3Provider);
    return App.initContract();
  },

  initContract: async function () {
    const data = await $.getJSON("WeightedElection.json");
    App.contracts.WeightedElection = TruffleContract(data);
    App.contracts.WeightedElection.setProvider(App.web3Provider);

    await App.loadAccount();
    App.bindEvents();
    return App.refreshState();
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
      accounts = await web3.eth.getAccounts();
    }

    if (!accounts || accounts.length === 0) {
      App.account = null;
      $("#accountAddress").text("No wallet detected");
      App.setStatus("Connect a wallet to interact with the dApp");
      throw new Error("No accounts available");
    }

    App.account = accounts[0];
    $("#accountAddress").text(App.account);
    App.setStatus("Ready");
  },

  bindEvents: function () {
    $("#addProposalForm").on("submit", App.handleAddProposal);
    $("#whitelistForm").on("submit", App.handleWhitelist);
    $("#startVotingBtn").on("click", App.handleStartVoting);
    $("#closeVotingBtn").on("click", App.handleCloseVoting);
    $("#voteBtn").on("click", App.handleVote);

    if (window.ethereum && window.ethereum.on) {
      window.ethereum.on("accountsChanged", async () => {
        await App.loadAccount();
        App.refreshState();
      });
    }
  },

  refreshState: async function () {
    try {
      const instance = await App.contracts.WeightedElection.deployed();
      const phaseId = (await instance.phase()).toNumber();
      const admin = await instance.admin();
      const role = App.account && admin.toLowerCase() === App.account.toLowerCase() ? "Admin" : "Voter";

      $("#phaseLabel").text(App.phaseLabels[phaseId] || phaseId);
      $("#accountRole").text(App.account ? role : "-");
      $("#adminActions").toggle(role === "Admin");

      await App.renderProposals(instance);
      await App.renderVoterState(instance, phaseId);
      await App.renderResults(instance, phaseId);
    } catch (error) {
      App.setStatus(error.message || "Unable to read contract state");
    }
  },

  renderProposals: async function (instance) {
    const tbody = $("#proposalsTable tbody");
    const select = $("#proposalSelect");
    tbody.empty();
    select.empty();

    const count = (await instance.proposalCount()).toNumber();
    for (let i = 0; i < count; i++) {
      const proposal = await instance.getProposal(i);
      const title = proposal.title || proposal[0];
      const votes = proposal.votes || proposal[1];
      const row = `<tr><td>${i}</td><td>${title}</td><td>${votes.toString()}</td></tr>`;
      tbody.append(row);
      select.append(`<option value="${i}">${title}</option>`);
    }

    if (count === 0) {
      tbody.append('<tr><td colspan="3" class="text-center">No proposals yet</td></tr>');
      select.append('<option value="" disabled selected>No proposals</option>');
    }

    select.prop("disabled", count === 0);
  },

  renderVoterState: async function (instance, phaseId) {
    if (!App.account) {
      $("#accountStatus").text("Connect MetaMask to continue");
      return;
    }

    try {
      const voter = await instance.getVoter(App.account);
      const whitelisted = voter.whitelisted || voter[0];
      const weightBn = voter.weight || voter[1];
      const voted = voter.voted || voter[2];
      const voteBn = voter.vote || voter[3];
      const weight = weightBn ? weightBn.toString() : "0";
      const vote = voteBn ? voteBn.toNumber() : 0;

      if (!whitelisted) {
        $("#accountStatus").text("Not whitelisted yet");
      } else if (voted) {
        $("#accountStatus").text(`Voted for proposal #${vote} with weight ${weight}`);
      } else {
        $("#accountStatus").text(`Whitelisted voter. Weight: ${weight}`);
      }

      $("#voteBtn").prop("disabled", !whitelisted || voted || phaseId !== 1);
    } catch (error) {
      $("#accountStatus").text("Unable to fetch voter info");
    }
  },

  renderResults: async function (instance, phaseId) {
    if (phaseId !== 2) {
      $("#leadingProposal").text("Results available after voting closes");
      return;
    }

    try {
      const winnerId = (await instance.winningProposal()).toNumber();
      const winner = await instance.getProposal(winnerId);
      const title = winner.title || winner[0];
      const votes = winner.votes || winner[1];
      $("#leadingProposal").text(`${title} (${votes.toString()} votes)`);
    } catch (error) {
      $("#leadingProposal").text("Unable to compute results");
    }
  },

  handleAddProposal: async function (event) {
    event.preventDefault();
    const title = $("#proposalTitle").val().trim();
    if (!title) {
      return App.setFeedback("Enter a proposal title", true);
    }
    try {
      const instance = await App.contracts.WeightedElection.deployed();
      await instance.addProposal(title, { from: App.account });
      $("#proposalTitle").val("");
      App.setFeedback("Proposal added", false);
      App.refreshState();
    } catch (error) {
      App.setFeedback(error.message, true);
    }
  },

  handleWhitelist: async function (event) {
    event.preventDefault();
    const address = $("#whitelistAddress").val().trim();
    const weight = parseInt($("#voterWeight").val(), 10);
    if (!web3.utils.isAddress(address)) {
      return App.setFeedback("Enter a valid address", true);
    }
    if (!weight || weight <= 0) {
      return App.setFeedback("Weight must be greater than zero", true);
    }

    try {
      const instance = await App.contracts.WeightedElection.deployed();
      await instance.whitelistVoter(address, weight, { from: App.account });
      $("#whitelistAddress").val("");
      App.setFeedback("Voter whitelisted", false);
      App.refreshState();
    } catch (error) {
      App.setFeedback(error.message, true);
    }
  },

  handleStartVoting: async function () {
    try {
      const instance = await App.contracts.WeightedElection.deployed();
      await instance.startVoting({ from: App.account });
      App.setFeedback("Voting phase started", false);
      App.refreshState();
    } catch (error) {
      App.setFeedback(error.message, true);
    }
  },

  handleCloseVoting: async function () {
    try {
      const instance = await App.contracts.WeightedElection.deployed();
      await instance.closeVoting({ from: App.account });
      App.setFeedback("Voting closed", false);
      App.refreshState();
    } catch (error) {
      App.setFeedback(error.message, true);
    }
  },

  handleVote: async function () {
    const proposalId = $("#proposalSelect").val();
    if (proposalId === null || proposalId === undefined || proposalId === "") {
      return App.setFeedback("Select a proposal first", true);
    }
    try {
      const instance = await App.contracts.WeightedElection.deployed();
      await instance.vote(proposalId, { from: App.account });
      App.setFeedback("Vote submitted", false);
      App.refreshState();
    } catch (error) {
      App.setFeedback(error.message, true);
    }
  },

  setFeedback: function (message, isError) {
    const el = $("#voterFeedback");
    el.text(message || "");
    el.toggleClass("text-danger", !!isError);
    el.toggleClass("text-success", !isError);
  },

  setStatus: function (message) {
    $("#accountStatus").text(message);
  }
};

$(function () {
  $(window).on("load", function () {
    App.init();
  });
});
