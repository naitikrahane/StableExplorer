"use client";
import { useEffect, useState, useRef } from 'react';
import { provider, formatGas, shortAddress } from '@/lib/utils';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { Box, Radio, Zap, Server, Globe, Cpu, Database, Loader2 } from 'lucide-react';

// Delay helper (RPC ko saans lene do)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default function Home() {
  const [stats, setStats] = useState({ gasPrice: '0', blockNumber: 0, chainId: 0 });
  const [blocks, setBlocks] = useState([]);
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Pointers
  const processedHashes = useRef(new Set());
  const historyPointer = useRef(0); 
  const isFetchingMore = useRef(false);

  const fetchMainData = async () => {
    try {
      // 1. Basic Stats
      const currentBlockNum = await provider.getBlockNumber();
      const feeData = await provider.getFeeData();
      const network = await provider.getNetwork();

      setStats({
        gasPrice: feeData.gasPrice,
        blockNumber: currentBlockNum,
        chainId: network.chainId.toString()
      });

      if (historyPointer.current === 0) {
          historyPointer.current = currentBlockNum - 6; 
      }

      // 2. FETCH LATEST BLOCKS (Sequentially to avoid rate limit)
      const displayRange = 6;
      let fetchedBlocks = [];

      for(let i=0; i<displayRange; i++) {
          try {
              const b = await provider.getBlock(currentBlockNum - i, false);
              if(b) fetchedBlocks.push(b);
              await sleep(100); // 100ms Delay per block
          } catch(e) { console.warn("Skip block", currentBlockNum - i); }
      }
      
      setBlocks(fetchedBlocks);

      // 3. COLLECT TRANSACTIONS
      let incomingTxs = [];

      // A. Check New Blocks
      for (const block of fetchedBlocks) {
          if (block.transactions && block.transactions.length > 0) {
              // Fetch Tx Details with delay
              const txsInBlock = await fetchTransactionsSafe(block.transactions);
              incomingTxs = [...incomingTxs, ...txsInBlock];
          }
      }

      // B. If List is small (< 20 items), Dig Deeper (Slowly)
      if (txs.length + incomingTxs.length < 20 && !isFetchingMore.current) {
          isFetchingMore.current = true;
          console.log(`Digging history from #${historyPointer.current}...`);
          
          let foundHistoryTxs = [];
          let attempts = 0;
          
          // Try fetching 2 batches of 5 blocks (Total 10 blocks)
          while (foundHistoryTxs.length < 5 && attempts < 2) {
              const start = historyPointer.current;
              
              for (let i = 0; i < 5; i++) {
                  if (start - i > 0) {
                      try {
                          const b = await provider.getBlock(start - i, false);
                          if (b && b.transactions.length > 0) {
                              const details = await fetchTransactionsSafe(b.transactions);
                              foundHistoryTxs = [...foundHistoryTxs, ...details];
                          }
                          await sleep(200); // 200ms delay between history blocks
                      } catch(e){}
                  }
              }
              
              historyPointer.current -= 5;
              attempts++;
          }
          
          incomingTxs = [...incomingTxs, ...foundHistoryTxs];
          isFetchingMore.current = false;
      }

      // 4. UPDATE UI
      if (incomingTxs.length > 0) {
          setTxs(prev => {
              const combined = [...incomingTxs, ...prev];
              const unique = combined.filter((t) => {
                  if (processedHashes.current.has(t.hash)) return false;
                  processedHashes.current.add(t.hash);
                  return true;
              });
              return unique.sort((a, b) => (b.blockNumber || 0) - (a.blockNumber || 0)).slice(0, 30);
          });
      }

    } catch(e) { console.error("Sync Error", e.message); } 
    finally { setLoading(false); }
  };

  // Helper: Fetch Txs Safely (One by one)
  const fetchTransactionsSafe = async (txList) => {
      const results = [];
      // Only check first 10 txs of a block to save time
      const subset = txList.slice(0, 10); 
      
      for (const tx of subset) {
          if (typeof tx === 'string') {
              try { 
                  const t = await provider.getTransaction(tx);
                  if(t) results.push(t);
                  await sleep(50); // Tiny delay per tx fetch
              } catch(e){ }
          } else {
              results.push(tx);
          }
      }
      return results;
  };

  useEffect(() => {
    fetchMainData();
    // Refresh every 12 seconds (Very Safe Interval)
    const interval = setInterval(fetchMainData, 12000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] pb-10">
      <Navbar />
      <main className="max-w-[1600px] mx-auto px-4 md:px-6 mt-8">
        
        {/* STATS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <StatCard icon={<Server size={20}/>} label="HEIGHT" value={`#${stats.blockNumber}`} />
            <StatCard icon={<Zap size={20}/>} label="GAS" value={`${formatGas(stats.gasPrice)} Gwei`} />
            <StatCard icon={<Globe size={20}/>} label="CHAIN ID" value={stats.chainId} />
            <StatCard icon={<Cpu size={20}/>} label="STATUS" value={txs.length > 0 ? "LIVE" : "SYNCING"} color="text-neon" />
        </div>

        {/* FEED */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* LATEST BLOCKS */}
            <div className="terminal-card">
                <div className="bg-[#111] p-3 border-b border-[#222] flex justify-between">
                    <h3 className="text-neon font-bold text-xs font-mono flex items-center gap-2">
                        <Box size={14}/> LATEST BLOCKS
                    </h3>
                </div>
                <div className="divide-y divide-[#1a1a1a]">
                    {loading && blocks.length === 0 ? <Loading/> : blocks.map(b => (
                        <div key={b.number} className="p-4 flex justify-between items-center hover:bg-[#0f0f0f] transition group">
                            <div className="flex items-center gap-4">
                                <div className="text-gray-500 font-mono text-[10px] group-hover:text-neon transition">[BK]</div>
                                <div>
                                    <Link href={`/block/${b.number}`} className="text-white font-mono text-sm hover:text-neon hover:underline decoration-dashed">BLOCK #{b.number}</Link>
                                    <p className="text-[10px] text-gray-500 font-mono">{(Date.now()/1000 - b.timestamp).toFixed(0)}s ago</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className={`text-[10px] font-mono px-2 py-1 rounded border border-[#222] ${b.transactions.length > 0 ? 'text-neon bg-neon/5' : 'text-gray-600'}`}>
                                    {b.transactions.length} txns
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* TRANSACTIONS */}
            <div className="terminal-card">
                <div className="bg-[#111] p-3 border-b border-[#222] flex justify-between items-center">
                    <h3 className="text-neon font-bold text-xs font-mono flex items-center gap-2">
                        <Radio size={14}/> RECENT TRANSACTIONS
                    </h3>
                    {isFetchingMore.current && (
                        <span className="flex items-center gap-1 text-[9px] text-yellow-500 font-mono animate-pulse">
                            <Loader2 size={10} className="animate-spin"/> DIGGING...
                        </span>
                    )}
                </div>
                <div className="divide-y divide-[#1a1a1a]">
                    {loading && txs.length === 0 ? <Loading/> : txs.map(tx => (
                        <div key={tx.hash} className="p-4 flex flex-col gap-1 hover:bg-[#0f0f0f] transition">
                            <div className="flex items-center gap-2">
                                <span className="text-neon font-mono text-[10px]">{'>'}</span>
                                <Link href={`/tx/${tx.hash}`} className="text-neon font-mono text-xs truncate w-full hover:underline decoration-dashed">
                                    {tx.hash}
                                </Link>
                            </div>
                            <div className="flex justify-between pl-4 mt-1">
                                <span className="text-[10px] text-gray-500 font-mono">F: {shortAddress(tx.from)}</span>
                                <span className="text-[10px] text-gray-500 font-mono">T: {shortAddress(tx.to)}</span>
                            </div>
                        </div>
                    ))}
                    {!loading && txs.length === 0 && (
                        <div className="p-10 text-center text-gray-600 font-mono text-xs">
                            <Database size={24} className="mx-auto mb-2 opacity-20"/>
                            SEARCHING HISTORY...
                        </div>
                    )}
                </div>
            </div>

        </div>
      </main>
    </div>
  );
}

const StatCard = ({icon, label, value, color}) => (
    <div className="terminal-card p-5 flex items-center gap-4 hover:border-neon transition bg-[#0a0a0a]">
        <div className={`p-3 bg-[#111] border border-[#333] text-gray-400`}>{icon}</div>
        <div>
            <p className="text-[10px] text-gray-500 font-bold font-mono uppercase">{label}</p>
            <p className={`text-xl font-bold font-mono ${color || 'text-white'}`}>{value}</p>
        </div>
    </div>
);

const Loading = () => <div className="p-6 text-center text-neon font-mono text-xs animate-pulse">_SYNCING_DATA...</div>;
