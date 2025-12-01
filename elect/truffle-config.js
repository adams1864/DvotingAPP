module.exports = {
  // See <http://truffleframework.com/docs/advanced/configuration>
  // for more about customizing your Truffle configuration!
  networks: {
    development: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "*" // Match any network id
    },
    develop: {
      port: 8545
    }
  },
  compilers: {
    solc: {
      version: "0.8.11",   // or "^0.8.11"
      settings: {
        optimizer: { enabled: false, runs: 200 } // optional, keep if you need it
      }
    }
  }
};
