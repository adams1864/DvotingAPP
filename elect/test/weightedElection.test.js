const WeightedElection = artifacts.require("WeightedElection");

contract("WeightedElection", (accounts) => {
  const [admin, voter1, voter2, outsider] = accounts;
  const proposals = ["Proposal A", "Proposal B", "Proposal C"];

  let election;

  beforeEach(async () => {
    election = await WeightedElection.new(proposals);
  });

  it("initializes with provided proposals and admin", async () => {
    const storedAdmin = await election.admin();
    assert.equal(storedAdmin, admin, "admin should be deployer");

    const count = await election.proposalCount();
    assert.equal(count.toNumber(), proposals.length, "proposal count mismatch");

    const proposal = await election.getProposal(0);
    assert.equal(proposal.title, proposals[0], "proposal title mismatch");
  });

  it("whitelists voters only during setup", async () => {
    await election.whitelistVoter(voter1, 3, { from: admin });
    const voter = await election.getVoter(voter1);
    assert.equal(voter.whitelisted, true, "voter should be whitelisted");
    assert.equal(voter.weight.toNumber(), 3, "weight mismatch");

    await election.startVoting({ from: admin });
    try {
      await election.whitelistVoter(voter2, 2, { from: admin });
      assert.fail("expected revert");
    } catch (err) {
      assert(err.message.includes("Wrong phase"));
    }
  });

  it("prevents non-admin actions", async () => {
    try {
      await election.whitelistVoter(voter1, 1, { from: outsider });
      assert.fail("expected revert");
    } catch (err) {
      assert(err.message.includes("Only admin"));
    }
  });

  it("allows weighted voting and blocks double voting", async () => {
    await election.whitelistVoter(voter1, 3, { from: admin });
    await election.whitelistVoter(voter2, 1, { from: admin });
    await election.startVoting({ from: admin });

    await election.vote(1, { from: voter1 });
    await election.vote(1, { from: voter2 });

    const proposal = await election.getProposal(1);
    assert.equal(proposal.votes.toNumber(), 4, "vote tally should equal combined weight");

    try {
      await election.vote(1, { from: voter1 });
      assert.fail("expected revert");
    } catch (err) {
      assert(err.message.includes("Already voted"));
    }
  });

  it("disallows voting before start and after finish", async () => {
    await election.whitelistVoter(voter1, 1, { from: admin });

    try {
      await election.vote(0, { from: voter1 });
      assert.fail("expected revert");
    } catch (err) {
      assert(err.message.includes("Wrong phase"));
    }

    await election.startVoting({ from: admin });
    await election.vote(0, { from: voter1 });
    await election.closeVoting({ from: admin });

    try {
      await election.vote(0, { from: voter1 });
      assert.fail("expected revert");
    } catch (err) {
      assert(err.message.includes("Wrong phase"));
    }
  });

  it("reports winning proposal after finish", async () => {
    await election.whitelistVoter(voter1, 5, { from: admin });
    await election.whitelistVoter(voter2, 2, { from: admin });
    await election.startVoting({ from: admin });

    await election.vote(0, { from: voter1 });
    await election.vote(2, { from: voter2 });
    await election.closeVoting({ from: admin });

    const winner = await election.winningProposal();
    assert.equal(winner.toNumber(), 0, "proposal 0 should win with highest weight");
  });
});
