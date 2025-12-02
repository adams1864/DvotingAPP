const GovernanceVoting = artifacts.require("GovernanceVoting");

module.exports = async function (deployer) {
  const electionName = "University Council Election 2025";
  
  const initialProposals = [
    "Increase Research Funding",
    "Build New Student Center",
    "Expand Online Programs"
  ];

  await deployer.deploy(GovernanceVoting, electionName, initialProposals);
  
  const instance = await GovernanceVoting.deployed();
  console.log("✅ GovernanceVoting deployed at:", instance.address);
  console.log("📋 Election:", electionName);
  console.log("📝 Initial proposals:", initialProposals.length);
};
