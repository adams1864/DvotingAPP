const WeightedElection = artifacts.require("WeightedElection");

module.exports = async function (deployer) {
  const demoProposals = [
    "Upgrade Campus WiFi",
    "Fund Hackathon",
    "Extend Library Hours"
  ];

  await deployer.deploy(WeightedElection, demoProposals);
};
