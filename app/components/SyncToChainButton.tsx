/* eslint-disable react-hooks/exhaustive-deps */
// --- React Methods
import React, { useCallback, useContext, useState } from "react";
import axios from "axios";
import { ethers } from "ethers";

// --Chakra UI Elements
import { Spinner, useToast } from "@chakra-ui/react";

import GitcoinVerifier from "../contracts/GitcoinVerifier.json";

import { CeramicContext } from "../context/ceramicContext";
import { UserContext } from "../context/userContext";

import { VerifiableCredential, EasPayload } from "@gitcoin/passport-types";

const SyncToChainButton = () => {
  const { passport } = useContext(CeramicContext);
  const { wallet, address } = useContext(UserContext);
  const [syncingToChain, setSyncingToChain] = useState(false);
  const toast = useToast();

  const onSyncToChain = useCallback(async (wallet, passport) => {
    if (passport && wallet) {
      try {
        setSyncingToChain(true);
        const credentials = passport.stamps.map(({ credential }: { credential: VerifiableCredential }) => credential);
        const ethersProvider = new ethers.BrowserProvider(wallet.provider, "any");
        const gitcoinAttesterContract = new ethers.Contract(
          process.env.NEXT_PUBLIC_GITCOIN_ATTESTER_CONTRACT_ADDRESS as string,
          GitcoinVerifier.abi,
          await ethersProvider.getSigner()
        );
        const nonce = await gitcoinAttesterContract.recipientNonces(address);

        const { data }: { data: EasPayload } = await axios({
          method: "post",
          url: `${process.env.NEXT_PUBLIC_PASSPORT_IAM_URL}v0.0.0/eas`,
          data: {
            credentials,
            nonce,
          },
          headers: {
            "Content-Type": "application/json",
          },
          transformRequest: [(data) => JSON.stringify(data, (k, v) => (typeof v === "bigint" ? v.toString() : v))],
        });

        if (data.error)
          console.log(
            "error syncing credentials to chain: ",
            data.error,
            "credentials: ",
            credentials,
            "nonce:",
            nonce
          );
        if (data.invalidCredentials.length > 0)
          console.log("not syncing invalid credentials: ", data.invalidCredentials);
        // TODO info toast for invalid credentials

        if (data.passport) {
          const { v, r, s } = data.signature;

          const transaction = await gitcoinAttesterContract.addPassportWithSignature(
            process.env.NEXT_PUBLIC_GITCOIN_VC_SCHEMA_UUID as string,
            data.passport,
            v,
            r,
            s,
            { value: data.passport.fee }
          );
          toast({
            title: "Submitted",
            description: "Passport submitted to chain",
            status: "info",
            duration: 5000,
            isClosable: true,
          });
          await transaction.wait();
          toast({
            title: "Success",
            description: "Passport successfully synced to chain",
            status: "success",
            duration: 9000,
            isClosable: true,
          });
        }
      } catch (e) {
        console.error("Error syncing credentials to chain: ", e);
        toast({
          title: "Error",
          description: "Failed to sync passport to chain",
          status: "error",
          duration: 9000,
          isClosable: true,
        });
      } finally {
        setSyncingToChain(false);
      }
    }
  }, []);

  return (
    <button
      className="h-10 w-10 rounded-md border border-muted"
      onClick={() => onSyncToChain(wallet, passport)}
      disabled={syncingToChain}
    >
      <div className={`${syncingToChain ? "block" : "hidden"} relative top-1`}>
        <Spinner thickness="2px" speed="0.65s" emptyColor="darkGray" color="gray" size="md" />
      </div>
      <div className={`${syncingToChain ? "hidden" : "block"}`}>{`⛓`}</div>
    </button>
  );
};

export default SyncToChainButton;
