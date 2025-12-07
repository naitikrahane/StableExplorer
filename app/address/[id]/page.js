"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { provider, shortAddress } from "@/lib/utils";
import { ethers } from "ethers";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import {
  Wallet,
  Code,
  Coins,
  Banknote,
  ChevronDown,
  Copy,
} from "lucide-react";

export default function AddressPage() {
  const params = useParams();
  const id = params?.id;

  // --- STATE ---
  const [summary, setSummary] = useState({
    balance: "0",
    nonce: 0,
    isContract: false,
    code: "0x",
    type: "LOADING...",
    meta: null, // { name, symbol, supply, decimals } if ERC20
  });

  const [holdings, setHoldings] = useState([]); // {name,symbol,balance,contract,isNative}
  const [netWorth, setNetWorth] = useState("0.00"); // reserved

  const [tokenTxs, setTokenTxs] = useState([]); // ethers.Log[]
  const [tokenMeta, setTokenMeta] = useState({}); // addrLower -> {symbol,name,decimals}

  const [loading, setLoading] = useState(true);
  const [scanStatus, setScanStatus] = useState("INITIALIZING...");
  const [activeTab, setActiveTab] = useState("token_transfers");
  const [showHoldings, setShowHoldings] = useState(false);

  useEffect(() => {
    if (!id) return;

    const runScan = async () => {
      try {
        setLoading(true);
        setScanStatus("FETCHING_ONCHAIN_STATE...");

        const address = String(id).toLowerCase();

        // 1) BASIC STATE
        const [balanceBN, code, count, latestBlock] = await Promise.all([
          provider.getBalance(address),
          provider.getCode(address),
          provider.getTransactionCount(address),
          provider.getBlockNumber(),
        ]);

        const isContract = code !== "0x";
        let contractMeta = null;

        // 2) IF CONTRACT, TRY ERC20 METADATA
        if (isContract) {
          setScanStatus("CHECKING_ERC20_INTERFACE...");
          try {
            const erc20 = new ethers.Contract(
              address,
              [
                "function name() view returns (string)",
                "function symbol() view returns (string)",
                "function totalSupply() view returns (uint256)",
                "function decimals() view returns (uint8)",
              ],
              provider
            );

            const [n, s, ts, d] = await Promise.all([
              erc20.name(),
              erc20.symbol(),
              erc20.totalSupply(),
              erc20.decimals(),
            ]);

            contractMeta = {
              name: n,
              symbol: s,
              supply: ethers.formatUnits(ts, d),
              decimals: Number(d),
            };
          } catch {
            contractMeta = null; // not ERC20
          }
        }

        setSummary({
          balance: ethers.formatEther(balanceBN),
          nonce: count,
          isContract,
          code,
          type: contractMeta
            ? "ERC-20 TOKEN"
            : isContract
            ? "SMART CONTRACT"
            : "EOA WALLET",
          meta: contractMeta,
        });

        // 3) TOKEN TRANSFERS VIA LOGS
        setScanStatus("FETCHING_TOKEN_TRANSFERS...");
        const transferTopic =
          "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
        const paddedId = ethers.zeroPadValue(address, 32).toLowerCase();

        const LOG_DEPTH = 5000;
        const fromBlock = Math.max(0, latestBlock - LOG_DEPTH);

        const logs = await provider.getLogs({
          fromBlock,
          toBlock: "latest",
          topics: [transferTopic],
        });

        // relevant if this addr is contract OR from OR to
        const relevantLogs = logs
          .filter((l) => {
            const addrLower = l.address.toLowerCase();
            const t1 = l.topics[1]?.toLowerCase();
            const t2 = l.topics[2]?.toLowerCase();
            return (
              addrLower === address ||
              t1 === paddedId ||
              t2 === paddedId
            );
          })
          .reverse();

        setTokenTxs(relevantLogs.slice(0, 200));

        // 4) HOLDINGS + TOKEN META
        setScanStatus("DISCOVERING_TOKEN_HOLDINGS...");
        const uniqueTokenContracts = [
          ...new Set(relevantLogs.map((l) => l.address.toLowerCase())),
        ];

        const holdingsData = [];
        const metaMap = {};

        // Native balance as GUSDT
        holdingsData.push({
          name: "FlowStable",
          symbol: "GUSDT",
          balance: ethers.formatEther(balanceBN),
          contract: null,
          isNative: true,
        });

        for (const tokenAddr of uniqueTokenContracts) {
          try {
            const erc20 = new ethers.Contract(
              tokenAddr,
              [
                "function balanceOf(address) view returns (uint256)",
                "function symbol() view returns (string)",
                "function name() view returns (string)",
                "function decimals() view returns (uint8)",
              ],
              provider
            );

            const [bal, sym, nm, dec] = await Promise.all([
              erc20.balanceOf(address),
              erc20.symbol(),
              erc20.name(),
              erc20.decimals(),
            ]);

            const decimals = Number(dec);
            metaMap[tokenAddr.toLowerCase()] = {
              symbol: sym,
              name: nm,
              decimals: decimals,
            };

            if (bal > 0n) {
              holdingsData.push({
                name: nm,
                symbol: sym,
                balance: ethers.formatUnits(bal, decimals),
                contract: tokenAddr,
                isNative: false,
              });
            }
          } catch {
            // ignore bad tokens
          }
        }

        // if address itself was ERC20 token
        if (contractMeta) {
          metaMap[address] = {
            symbol: contractMeta.symbol,
            name: contractMeta.name,
            decimals: contractMeta.decimals,
          };
        }

        setHoldings(holdingsData);
        setTokenMeta(metaMap);
        setScanStatus("COMPLETE");
      } catch (e) {
        console.error("Address scan error:", e);
        setScanStatus("ERROR");
      } finally {
        setLoading(false);
      }
    };

    runScan();
  }, [id]);

  const handleCopy = () => {
    try {
      navigator.clipboard.writeText(String(id));
      alert("Address Copied to Clipboard");
    } catch {
      console.warn("Clipboard API failed");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center text-neon font-mono gap-6">
          <div className="relative">
            <div className="absolute inset-0 bg-neon blur-xl opacity-20 animate-pulse" />
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-neon relative z-10" />
          </div>
          <div className="text-center">
            <p className="text-neon font-bold tracking-widest text-sm mb-2">
              {scanStatus}
            </p>
            <p className="text-gray-600 text-xs">
              Reconstructing history directly from RPC...
            </p>
          </div>
        </div>
      </div>
    );
  }

  const balanceNumber = Number(summary.balance || "0");

  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <Navbar />
      <main className="max-w-[1600px] mx-auto px-4 md:px-6 pt-8">
        {/* TOP HEADER CARD */}
        <div className="terminal-card p-8 mb-8 bg-[#080808] border-t-4 border-t-neon">
          <div className="flex flex-col md:flex-row gap-8 items-start">
            {/* ICON */}
            <div
              className={`w-20 h-20 flex items-center justify-center border-2 rounded-sm shadow-[0_0_40px_rgba(0,0,0,0.5)] ${
                summary.meta
                  ? "border-neon text-neon bg-neon/5"
                  : summary.isContract
                  ? "border-gray-400 text-gray-300 bg-[#111]"
                  : "border-gray-600 text-gray-500 bg-[#111]"
              }`}
            >
              {summary.meta ? (
                <Coins size={40} />
              ) : summary.isContract ? (
                <Code size={40} />
              ) : (
                <Wallet size={40} />
              )}
            </div>

            {/* INFO */}
            <div className="flex-1 w-full">
              <div className="flex flex-col md:flex-row md:items-center gap-4 mb-2">
                <h1 className="text-3xl font-bold text-white font-mono">
                  {summary.meta
                    ? summary.meta.name
                    : summary.isContract
                    ? "Smart Contract"
                    : "Address"}
                </h1>
                <span className="text-[10px] border border-neon text-neon px-3 py-1 rounded-full bg-neon/10 font-bold tracking-wider w-fit">
                  {summary.type}
                </span>
              </div>

              <div
                className="flex items-center gap-3 group cursor-pointer w-full md:w-fit"
                onClick={handleCopy}
              >
                <p className="text-gray-400 font-mono text-sm bg-[#000] p-2 px-4 border border-[#222] break-all hover:text-white hover:border-neon transition rounded-sm">
                  {id}
                </p>
                <Copy
                  size={18}
                  className="text-gray-600 group-hover:text-neon transition"
                />
              </div>
            </div>
          </div>
        </div>

        {/* STATS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* BALANCE & HOLDINGS */}
          <div className="terminal-card p-6 flex flex-col justify-between relative min-h-[140px]">
            <div className="flex justify-between items-start">
              <p className="text-gray-500 text-[10px] font-mono font-bold uppercase tracking-widest">
                NATIVE BALANCE
              </p>
              <div className="p-2 bg-neon/10 rounded-full text-neon">
                <Banknote size={16} />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold font-mono text-white truncate">
                {balanceNumber.toFixed(4)} GUSDT
              </p>
              <div className="relative mt-2">
                <button
                  onClick={() => setShowHoldings(!showHoldings)}
                  className="flex items-center gap-2 text-xs text-gray-400 hover:text-neon border border-[#333] px-3 py-1.5 rounded bg-[#111] w-full justify-between"
                >
                  <span>Holdings: {holdings.length} Tokens</span>
                  <ChevronDown
                    size={14}
                    className={`transition ${
                      showHoldings ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {showHoldings && (
                  <div className="absolute top-full left-0 w-full mt-1 bg-[#0a0a0a] border border-[#333] shadow-xl z-20 max-h-60 overflow-auto custom-scrollbar rounded-sm">
                    {holdings.map((h, i) => {
                      const balNum = Number(h.balance || "0");
                      return (
                        <div
                          key={i}
                          className="p-3 hover:bg-[#111] border-b border-[#222] last:border-0 flex justify-between items-center"
                        >
                          <div className="flex flex-col">
                            <span className="text-xs text-white font-bold">
                              {h.symbol}
                            </span>
                            <span className="text-[10px] text-gray-500">
                              {h.name}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-neon font-mono">
                              {balNum.toFixed(4)}
                            </span>
                            {h.isNative && (
                              <span className="block text-[8px] text-gray-600">
                                GAS
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* TOKEN META / NONCE */}
          {summary.meta ? (
            <div className="terminal-card p-6 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <p className="text-gray-500 text-[10px] font-mono font-bold uppercase tracking-widest">
                  TOKEN STATS
                </p>
                <Coins size={16} className="text-gray-600" />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-400 border-b border-[#222] pb-1">
                  <span>Supply:</span>
                  <span className="text-white font-mono">
                    {Number(summary.meta.supply).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Decimals:</span>
                  <span className="text-white font-mono">
                    {summary.meta.decimals}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="terminal-card p-6 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <p className="text-gray-500 text-[10px] font-mono font-bold uppercase tracking-widest">
                  TRANSACTION COUNT
                </p>
                <span className="text-gray-600 text-xs font-mono">NONCE</span>
              </div>
              <p className="text-2xl font-bold font-mono text-white">
                {summary.nonce}
              </p>
              <p className="text-[10px] text-gray-600 font-mono">
                Total Nonce
              </p>
            </div>
          )}

          {/* STATUS */}
          <div className="terminal-card p-6 flex flex-col justify-between border-l-4 border-l-neon bg-[#0c0c0c]">
            <div className="flex justify-between items-start">
              <p className="text-gray-500 text-[10px] font-mono font-bold uppercase tracking-widest">
                ACCOUNT STATUS
              </p>
              <div className="w-2 h-2 bg-neon rounded-full animate-pulse" />
            </div>
            <p className="text-xl font-bold font-mono text-white">ACTIVE</p>
            <p className="text-[10px] text-neon font-mono">
              Last activity in scanned range
            </p>
          </div>
        </div>

        {/* TOKEN TRANSFERS ONLY */}
        <div className="terminal-card min-h-[400px]">
          <div className="flex bg-[#111] border-b border-[#222] overflow-x-auto">
            <button
              onClick={() => setActiveTab("token_transfers")}
              className={`px-8 py-4 text-xs font-mono font-bold uppercase whitespace-nowrap transition-all border-b-2 ${
                activeTab === "token_transfers"
                  ? "text-neon border-neon bg-neon/5"
                  : "text-gray-500 border-transparent hover:text-gray-300 hover:bg-[#1a1a1a]"
              }`}
            >
              Token Transfers ({tokenTxs.length})
            </button>
          </div>

          <div className="p-0">
            <div className="p-3 bg-[#0a0a0a] border-b border-[#222] flex items-center gap-2 text-[10px] text-gray-500 font-mono">
              Showing ERC20 <span className="font-bold">Transfer</span> logs
              where this address is token, sender or receiver.
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left font-mono text-sm min-w-[1000px]">
                <thead className="text-gray-500 bg-[#0f0f0f] border-b border-[#222]">
                  <tr>
                    <th className="p-4 w-16 font-normal text-[10px] uppercase">
                      Dir
                    </th>
                    <th className="p-4 w-40 font-normal text-[10px] uppercase">
                      Token
                    </th>
                    <th className="p-4 w-48 font-normal text-[10px] uppercase">
                      From
                    </th>
                    <th className="p-4 w-16 font-normal text-[10px] uppercase" />
                    <th className="p-4 w-48 font-normal text-[10px] uppercase">
                      To
                    </th>
                    <th className="p-4 w-40 font-normal text-[10px] uppercase text-right">
                      Amount
                    </th>
                    <th className="p-4 w-40 font-normal text-[10px] uppercase text-right">
                      Raw Value
                    </th>
                    <th className="p-4 w-24 font-normal text-[10px] uppercase">
                      Block
                    </th>
                    <th className="p-4 w-48 font-normal text-[10px] uppercase">
                      Tx Hash
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1a1a1a]">
                  {tokenTxs.length === 0 && (
                    <tr>
                      <td
                        colSpan={9}
                        className="text-center text-xs text-gray-500 py-10"
                      >
                        No token transfers found in the scanned range.
                      </td>
                    </tr>
                  )}

                  {tokenTxs.map((log, i) => {
                    const addrLower = String(id).toLowerCase();
                    const fromTopic = log.topics[1];
                    const toTopic = log.topics[2];

                    const from =
                      fromTopic && fromTopic.length >= 66
                        ? "0x" + fromTopic.slice(fromTopic.length - 40)
                        : "";
                    const to =
                      toTopic && toTopic.length >= 66
                        ? "0x" + toTopic.slice(toTopic.length - 40)
                        : "";

                    const isIncoming = to.toLowerCase() === addrLower;

                    const meta =
                      tokenMeta[log.address.toLowerCase()] ||
                      { symbol: "UNK", name: "", decimals: 18 };

                    const amountFormatted = formatWithDecimals(
                      log.data,
                      meta.decimals
                    );
                    const rawValue = hexToDecString(log.data);
                    const blockNum = hexToDecString(
                      log.blockNumber || "0x0"
                    );

                    return (
                      <tr
                        key={i}
                        className="hover:bg-[#111] transition group"
                      >
                        <td className="p-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[9px] border font-bold ${
                              isIncoming
                                ? "border-green-800 text-green-500 bg-green-900/20"
                                : "border-yellow-800 text-yellow-500 bg-yellow-900/20"
                            }`}
                          >
                            {isIncoming ? "IN
