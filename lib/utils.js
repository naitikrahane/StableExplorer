import { ethers } from 'ethers';

// --- 1. CORE RPC CONFIGURATION ---
export const RPC_URL = "https://omega-13.gateway.tenderly.co/3x99VRWFjyHzv9iT0LZED4";

// Optimized Provider
export const provider = new ethers.JsonRpcProvider(RPC_URL, undefined, {
    staticNetwork: true,
    batchMaxCount: 5,
});

// --- 2. FORMATTERS ---
export const shortAddress = (addr) => {
    if (!addr) return "NULL";
    try { return `${addr.slice(0, 6)}...${addr.slice(-4)}`; } catch (e) { return addr; }
};

export const formatGas = (val) => {
    if (!val) return '0.00';
    try { return parseFloat(ethers.formatUnits(val, 'gwei')).toFixed(4); } catch (e) { return '0'; }
};

// --- 3. HEAVY INPUT DECODER (Renamed back to decodeInputData) ---
export const decodeInputData = (data) => {
    if (!data || data === '0x') {
        return { method: 'Transfer', type: 'Simple', params: [] };
    }

    const methodId = data.slice(0, 10).toLowerCase();
    
    const methods = {
        '0xa9059cbb': 'transfer',
        '0x095ea7b3': 'approve',
        '0x23b872dd': 'transferFrom',
        '0x42842e0e': 'safeTransferFrom',
        '0x60806040': 'contractCreation',
        '0x7ff36ab5': 'swapETHForTokens',
        '0x18cbafe5': 'swapTokensForETH',
        '0xd0e30db0': 'deposit',
        '0x2e1a7d4d': 'withdraw'
    };

    return {
        method: methods[methodId] || 'Unknown Method',
        methodId: methodId,
        raw: data
    };
};

// --- 4. LOG PARSER ---
export const parseEventLog = (log) => {
    if (!log || !log.topics || log.topics.length === 0) return { name: 'Unknown', isStandard: false };

    const topic0 = log.topics[0].toLowerCase();
    const EVENTS = {
        '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef': 'Transfer',
        '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925': 'Approval',
        '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822': 'Swap'
    };

    const eventName = EVENTS[topic0];

    if (eventName === 'Transfer') {
        return {
            name: 'Transfer',
            from: log.topics[1] ? ethers.stripZerosLeft(log.topics[1]) : '0x0',
            to: log.topics[2] ? ethers.stripZerosLeft(log.topics[2]) : '0x0',
            isStandard: true
        };
    }
    
    return { name: eventName || 'Log Event', isStandard: !!eventName };
};

// Also export decodeMethod for backward compatibility if needed by Address page
export const decodeMethod = decodeInputData;
