import algosdk from "algosdk";

async function test() {
  try {
    const ALGOD_SERVER = "https://testnet-api.algonode.cloud";
    const algodClient = new algosdk.Algodv2("", ALGOD_SERVER, "");
    
    const params = await algodClient.getTransactionParams().do();
    const account = algosdk.generateAccount();
    const creatorAddress = account.addr;
    
    // Test 1: App Create Params
    console.log("Testing createTxn");
    const createTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: creatorAddress,
        receiver: creatorAddress,
        amount: 0,
        suggestedParams: params
    });
    
    // sign it
    const signedTxn = createTxn.signTxn(account.sk);
    const sendResult = await algodClient.sendRawTransaction(signedTxn).do();
    const txId = sendResult.txid;
    console.log("Tx id: ", txId);
    
    // wait for confirmation
    const createConfirmation = await algosdk.waitForConfirmation(algodClient, txId, 4);
    console.log("createConfirmation:", Object.keys(createConfirmation));
    console.log("Application Index via JSON:", JSON.stringify(createConfirmation['application-index']));
    console.log("Application Index camel:", createConfirmation.applicationIndex);

    // Test 2: Fund AppCall
    console.log("Testing fundAppCallTxn");
    const appIdNumber = Number(12345);
    const fundAppCallTxn = algosdk.makeApplicationNoOpTxnFromObject({
      sender: creatorAddress,
      appIndex: appIdNumber as any,
      suggestedParams: params,
      appArgs: [new Uint8Array(Buffer.from("fund"))],
    });
    console.log("fundAppCallTxn succeeded");

    // Test 3: Fund Pay
    console.log("Testing fundPayTxn");
    const fundAmountMicroAlgos = 5000000;
    const fundPayTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: creatorAddress,
      receiver: creatorAddress,
      amount: fundAmountMicroAlgos as any,
      suggestedParams: params,
    });
    console.log("fundPayTxn succeeded");

  } catch (e: any) {
    console.error("Caught error:", e.message);
    if (e.stack) {
        console.error(e.stack);
    }
  }
}

test();
