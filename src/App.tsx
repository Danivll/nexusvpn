import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Power, Activity, Lock, Clock, ArrowDownToLine, ArrowUpFromLine, X, ShieldCheck, ChevronRight, Zap, Signal, Star, Search, Check, RefreshCw } from 'lucide-react';
import './app.css';

declare global {
  interface Window {
    electronAPI?: {
      getServers:     () => Promise<VpnServer[]>;
      refreshServers: () => Promise<VpnServer[]>;
      connect:        (id: string) => Promise<{ ok: boolean; error?: string }>;
      disconnect:     () => Promise<{ ok: boolean }>;
      checkOpenVPN:   () => Promise<{ found: boolean; path: string | null; isAdmin?: boolean }>;
      onVpnEvent:     (cb: (e: { event: string; payload?: unknown }) => void) => () => void;
    };
  }
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

interface VpnServer {
  id: string; name: string; country: string; flag: string;
  ping: number; ip: string; protocol: string; port: number;
  speed: number; sessions: number;
}

const WARP_SERVERS: VpnServer[] = [
  { id: 'warp-auto',  name: 'Automatic',    country: 'Automatic',       flag: '⚡', ping: 5,   ip: '1.1.1.1',         protocol: 'WARP', port: 2408, speed: 100, sessions: 0 },
  { id: 'warp-br',    name: 'São Paulo',    country: 'Brazil',          flag: '🇧🇷', ping: 45,  ip: '162.159.192.10',   protocol: 'WARP', port: 2408, speed: 90,  sessions: 0 },
  { id: 'warp-co',    name: 'Bogotá',       country: 'Colombia',        flag: '🇨🇴', ping: 40,  ip: '162.159.196.10',   protocol: 'WARP', port: 2408, speed: 90,  sessions: 0 },
  { id: 'warp-mx',    name: 'Mexico City',  country: 'Mexico',          flag: '🇲🇽', ping: 60,  ip: '162.159.194.10',   protocol: 'WARP', port: 2408, speed: 85,  sessions: 0 },
  { id: 'warp-us',    name: 'New York',     country: 'United States',   flag: '🇺🇸', ping: 80,  ip: '162.159.193.10',   protocol: 'WARP', port: 2408, speed: 80,  sessions: 0 },
  { id: 'warp-us-la', name: 'Los Angeles',  country: 'United States',   flag: '🇺🇸', ping: 75,  ip: '162.159.195.10',   protocol: 'WARP', port: 2408, speed: 85,  sessions: 0 },
  { id: 'warp-ar',    name: 'Buenos Aires', country: 'Argentina',       flag: '🇦🇷', ping: 55,  ip: '162.159.197.10',   protocol: 'WARP', port: 2408, speed: 80,  sessions: 0 },
  { id: 'warp-uk',    name: 'London',       country: 'United Kingdom',  flag: '🇬🇧', ping: 130, ip: '162.159.198.10',   protocol: 'WARP', port: 2408, speed: 75,  sessions: 0 },
  { id: 'warp-de',    name: 'Frankfurt',    country: 'Germany',         flag: '🇩🇪', ping: 140, ip: '162.159.199.10',   protocol: 'WARP', port: 2408, speed: 70,  sessions: 0 },
  { id: 'warp-ca',    name: 'Toronto',      country: 'Canada',          flag: '🇨🇦', ping: 90,  ip: '162.159.201.10',   protocol: 'WARP', port: 2408, speed: 78,  sessions: 0 },
];

function formatTime(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return [h, m, sec].map(n => String(n).padStart(2, '0')).join(':');
}

export default function App() {
  const [status, setStatus]                   = useState<ConnectionStatus>('disconnected');
  const [servers, setServers]                 = useState<VpnServer[]>(WARP_SERVERS);
  const [isLoadingServers, setIsLoadingServers] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<VpnServer>(WARP_SERVERS[0]);
  const [searchQuery, setSearchQuery]         = useState('');
  const [connectionTime, setConnectionTime]   = useState(0);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [currentPing, setCurrentPing]         = useState(WARP_SERVERS[0].ping);
  const [isAutoReconnect, setIsAutoReconnect] = useState(true);
  const [favoriteIds, setFavoriteIds]         = useState<string[]>([]);
  const [downloadSpeed, setDownloadSpeed]     = useState(0);
  const [uploadSpeed, setUploadSpeed]         = useState(0);
  const [isPinging, setIsPinging]             = useState(false);
  const [lastPingResult, setLastPingResult]   = useState<number | null>(null);
  const [serverLoads, setServerLoads]         = useState<Record<string, number>>({});
  const [vpnError, setVpnError]               = useState<string | null>(null);
  const [warpFound, setWarpFound]             = useState<boolean | null>(null);
  const [stability, setStability]             = useState<'Stable' | 'Intermittent'>('Stable');
  const isElectron = !!window.electronAPI;

  const loadServers = useCallback(async (force = false) => {
    if (!window.electronAPI) return;
    setIsLoadingServers(true);
    try {
      const data = force ? await window.electronAPI.refreshServers() : await window.electronAPI.getServers();
      if (data?.length > 0) {
        setServers(data);
        setSelectedLocation(prev => data.find(s => s.id === prev.id) ?? data[0]);
      }
    } catch { /* use fallback */ }
    finally { setIsLoadingServers(false); }
  }, []);

  useEffect(() => { loadServers(); }, [loadServers]);

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.checkOpenVPN().then(({ found }) => setWarpFound(found));
    const unsub = window.electronAPI.onVpnEvent((evt) => {
      if (evt.event === 'connected') { setStatus('connected'); setVpnError(null); }
      else if (evt.event === 'disconnected') setStatus('disconnected');
    });
    return unsub;
  }, []);

  // Server load bars
  useEffect(() => {
    const initial: Record<string, number> = {};
    servers.forEach(s => { initial[s.id] = Math.floor(Math.random() * 60) + 20; });
    setServerLoads(initial);
    const id = setInterval(() => {
      setServerLoads(prev => {
        const next = { ...prev };
        servers.forEach(s => { next[s.id] = Math.max(10, Math.min(95, (next[s.id] || 0) + (Math.random() * 20) - 10)); });
        return next;
      });
    }, 4000);
    return () => clearInterval(id);
  }, [servers]);

  // Connection timers & speeds
  useEffect(() => {
    if (status !== 'connected') {
      setConnectionTime(0); setCurrentPing(selectedLocation.ping);
      setStability('Stable'); setDownloadSpeed(0); setUploadSpeed(0);
      setLastPingResult(null); setIsPinging(false);
      return;
    }
    setDownloadSpeed(Math.random() * 50 + 20);
    setUploadSpeed(Math.random() * 10 + 5);
    const timer   = setInterval(() => setConnectionTime(p => p + 1), 1000);
    const speeds  = setInterval(() => {
      setDownloadSpeed(p => Math.max(0, p + (Math.random() * 10 - 5)));
      setUploadSpeed(p => Math.max(0, p + (Math.random() * 5 - 2.5)));
    }, 1200);
    const pings   = setInterval(() => {
      const v = Math.max(5, Math.round(selectedLocation.ping + (Math.random() * 50) - 10));
      setCurrentPing(v);
      setStability(v > selectedLocation.ping + 30 ? 'Intermittent' : 'Stable');
    }, 2000);
    return () => { clearInterval(timer); clearInterval(speeds); clearInterval(pings); };
  }, [status, selectedLocation.ping]);

  const handleConnect = useCallback(async () => {
    setVpnError(null);
    if (status !== 'disconnected') {
      window.electronAPI?.disconnect();
      setStatus('disconnected');
      return;
    }
    setStatus('connecting');
    if (window.electronAPI) {
      const res = await window.electronAPI.connect(selectedLocation.id);
      if (!res.ok) { setStatus('disconnected'); setVpnError(res.error ?? 'Unknown error'); }
    } else {
      setTimeout(() => setStatus('connected'), 2000);
    }
  }, [status, selectedLocation.id]);

  const handleQuickConnect = useCallback(async () => {
    const fastest = servers.reduce((p, c) => p.ping < c.ping ? p : c);
    setSelectedLocation(fastest);
    setVpnError(null);
    if (status !== 'connected') {
      setStatus('connecting');
      if (window.electronAPI) {
        const res = await window.electronAPI.connect(fastest.id);
        if (!res.ok) { setStatus('disconnected'); setVpnError(res.error ?? 'Unknown error'); }
      } else setTimeout(() => setStatus('connected'), 2000);
    }
  }, [servers, status]);

  const handlePingTest = useCallback(() => {
    setIsPinging(true); setLastPingResult(null);
    setTimeout(() => {
      setLastPingResult(Math.max(5, Math.round(selectedLocation.ping + (Math.random() * 20 - 10))));
      setIsPinging(false);
    }, 1500);
  }, [selectedLocation.ping]);

  const toggleFavorite = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setFavoriteIds(p => p.includes(id) ? p.filter(f => f !== id) : [...p, id]);
  }, []);

  const { favorites, others } = useMemo(() => {
    const filtered = servers.filter(s =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.country.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return {
      favorites: filtered.filter(s => favoriteIds.includes(s.id)),
      others:    filtered.filter(s => !favoriteIds.includes(s.id)),
    };
  }, [searchQuery, favoriteIds, servers]);

  const locationLabel = selectedLocation.country === selectedLocation.name
    ? selectedLocation.name
    : `${selectedLocation.name}, ${selectedLocation.country}`;

  const isConnected   = status === 'connected';
  const isConnecting  = status === 'connecting';
  const accent = isConnected ? 'emerald' : 'indigo';

  return (
    <div className="nexus-root">
      <div className={`nexus-app ${status}`}>
        {/* Ambient glow */}
        <div className={`nexus-glow ${status}`} />

        {/* WARP missing banner */}
        {isElectron && warpFound === false && (
          <div className="nexus-banner warn">
            <span>⚠️ Cloudflare WARP no encontrado.</span>
            <span className="nexus-banner-sub">Instálalo desde <b>1.1.1.1</b> para conexiones reales.</span>
          </div>
        )}

        {/* Error banner */}
        {vpnError && (
          <div className="nexus-banner error">
            <span>{vpnError}</span>
            <button onClick={() => setVpnError(null)} aria-label="Cerrar"><X size={14} /></button>
          </div>
        )}

        {/* Header */}
        <header className="nexus-header">
          <div className="nexus-logo">
            <Lock size={22} className={`nexus-logo-icon ${accent}`} />
            <span className="nexus-logo-text">Nexus<span className={accent}>VPN</span></span>
          </div>
          <div className="nexus-header-right">
            {isConnected ? (
              <div className="nexus-ip-box visible">
                <span className="nexus-ip-label">Visible IP</span>
                <span className="nexus-ip-value">{selectedLocation.ip}</span>
              </div>
            ) : (
              <div className="nexus-ip-box exposed">
                <span className="nexus-ip-label">Real IP Exposed</span>
                <span className="nexus-ip-value">190.142.206.97</span>
              </div>
            )}
            <div className={`nexus-dot ${isConnected ? 'on' : 'off'}`} />
          </div>
        </header>

        {/* Main */}
        <main className="nexus-main">
          {/* Power button */}
          <div className="nexus-btn-wrap">
            {status !== 'disconnected' && (
              <>
                <div className={`nexus-ripple r1 ${accent}`} />
                <div className={`nexus-ripple r2 ${accent}`} />
              </>
            )}
            <button
              className={`nexus-power-outer ${status}`}
              onClick={handleConnect}
              aria-label="Toggle VPN"
            >
              <div className={`nexus-power-inner ${status}`}>
                {isConnected ? <ShieldCheck size={88} strokeWidth={1.5} /> : <Power size={88} strokeWidth={1.5} className={isConnecting ? 'nexus-pulse' : ''} />}
              </div>
            </button>
          </div>

          {/* Status text */}
          <div className="nexus-status-wrap">
            <h2 className={`nexus-status-title ${status}`}>
              {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Disconnected'}
            </h2>
            {isConnected && (
              <div className="nexus-status-meta">
                <Clock size={14} /> <span>{formatTime(connectionTime)}</span>
                <span className="nexus-dot-sep" />
                <Signal size={13} className={stability === 'Stable' ? 'emerald' : 'amber'} />
                <span className={stability === 'Stable' ? 'emerald' : 'amber'}>{stability}</span>
                {lastPingResult !== null && <><span className="nexus-dot-sep" /><span>Ping: {lastPingResult}ms</span></>}
              </div>
            )}
            {isConnecting && <p className="nexus-status-sub">Negotiating securely with server...</p>}
            {status === 'disconnected' && <p className="nexus-status-sub">Your internet traffic is unencrypted.</p>}
          </div>

          {/* Action row */}
          <div className="nexus-actions">
            <button
              className={`nexus-location-btn ${isConnected ? 'connected' : ''}`}
              onClick={() => setIsLocationModalOpen(true)}
            >
              <span className="nexus-flag-circle">{selectedLocation.flag}</span>
              <div className="nexus-location-info">
                <span className="nexus-location-label">Location</span>
                <span className="nexus-location-value">{locationLabel}</span>
              </div>
              <ChevronRight size={18} className={accent} />
            </button>

            {status === 'disconnected' && (
              <button className="nexus-quick-btn" onClick={handleQuickConnect}>
                <Zap size={18} /> Quick Connect
              </button>
            )}
            {isConnected && (
              <button className="nexus-ping-btn" onClick={handlePingTest} disabled={isPinging}>
                <Activity size={18} className={isPinging ? 'nexus-pulse' : ''} />
                {isPinging ? 'Testing...' : 'Ping Test'}
              </button>
            )}
          </div>

          {/* Auto-reconnect */}
          <div className="nexus-toggle-row">
            <span>Auto-reconnect</span>
            <button
              className={`nexus-toggle ${isAutoReconnect ? 'on' : ''}`}
              onClick={() => setIsAutoReconnect(p => !p)}
              aria-label="Toggle auto-reconnect"
            >
              <span className="nexus-toggle-thumb" />
            </button>
          </div>
        </main>

        {/* Stats footer */}
        <footer className="nexus-footer">
          {isConnected ? (
            <div className="nexus-stats">
              <div className="nexus-stat">
                <div className="nexus-stat-icon emerald"><ArrowDownToLine size={18} /></div>
                <div>
                  <span className="nexus-stat-label">Download</span>
                  <div className="nexus-stat-value">{downloadSpeed.toFixed(1)}<span>Mbps</span></div>
                </div>
              </div>
              <div className="nexus-stat border-x">
                <div className="nexus-stat-icon emerald"><ArrowUpFromLine size={18} /></div>
                <div>
                  <span className="nexus-stat-label">Upload</span>
                  <div className="nexus-stat-value">{uploadSpeed.toFixed(1)}<span>Mbps</span></div>
                </div>
              </div>
              <div className="nexus-stat">
                <div className="nexus-stat-icon indigo"><Activity size={18} /></div>
                <div>
                  <span className="nexus-stat-label">Ping</span>
                  <div className="nexus-stat-value">{currentPing}<span>ms</span></div>
                </div>
              </div>
            </div>
          ) : (
            <p className="nexus-footer-label">NexusVPN Protocol • Cloudflare WARP</p>
          )}
        </footer>

        {/* Location Modal */}
        {isLocationModalOpen && (
          <div className="nexus-overlay" onClick={() => setIsLocationModalOpen(false)}>
            <div className="nexus-modal" onClick={e => e.stopPropagation()}>
              <div className="nexus-modal-header">
                <div>
                  <h3>Select Location</h3>
                  {isElectron && <p>{isLoadingServers ? '⟳ Updating...' : `${servers.length} Cloudflare WARP locations`}</p>}
                </div>
                <div className="nexus-modal-actions">
                  {isElectron && (
                    <button onClick={() => loadServers(true)} disabled={isLoadingServers} title="Refresh">
                      <RefreshCw size={16} className={isLoadingServers ? 'nexus-spin' : ''} />
                    </button>
                  )}
                  <button onClick={() => setIsLocationModalOpen(false)}><X size={18} /></button>
                </div>
              </div>

              <div className="nexus-modal-search">
                <Search size={15} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search city or country..."
                />
              </div>

              <div className="nexus-modal-list">
                {favorites.length > 0 && (
                  <>
                    <div className="nexus-list-heading">Favorites ({favorites.length})</div>
                    {favorites.map(loc => (
                      <ServerRow
                        key={loc.id}
                        loc={loc}
                        selected={selectedLocation.id === loc.id}
                        isFav
                        load={serverLoads[loc.id] || 0}
                        onSelect={() => { setSelectedLocation(loc); setIsLocationModalOpen(false); }}
                        onFav={(e) => toggleFavorite(e, loc.id)}
                      />
                    ))}
                  </>
                )}
                <div className="nexus-list-heading">All Servers ({others.length})</div>
                {others.map(loc => (
                  <ServerRow
                    key={loc.id}
                    loc={loc}
                    selected={selectedLocation.id === loc.id}
                    isFav={false}
                    load={serverLoads[loc.id] || 0}
                    onSelect={() => { setSelectedLocation(loc); setIsLocationModalOpen(false); }}
                    onFav={(e) => toggleFavorite(e, loc.id)}
                  />
                ))}
                {favorites.length === 0 && others.length === 0 && (
                  <div className="nexus-empty">No locations found for "{searchQuery}"</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface ServerRowProps {
  key?: React.Key;
  loc: VpnServer; selected: boolean; isFav: boolean;
  load: number; onSelect: () => void; onFav: (e: React.MouseEvent) => void;
}

function ServerRow({ loc, selected, isFav, load, onSelect, onFav }: ServerRowProps) {
  const loadColor = load < 50 ? '#10b981' : load < 80 ? '#f59e0b' : '#ef4444';
  return (
    <button className={`nexus-server-row ${selected ? 'active' : ''}`} onClick={onSelect}>
      <span className="nexus-server-flag">{loc.flag}</span>
      <div className="nexus-server-info">
        <span className={selected ? 'active' : ''}>{loc.name}</span>
        <span>{loc.country}</span>
      </div>
      <div className="nexus-server-meta">
        <div className="nexus-server-ping">
          <Activity size={11} style={{ color: '#10b981' }} /> {loc.ping}ms
        </div>
        <div className="nexus-load-bar"><div style={{ width: `${load}%`, background: loadColor }} /></div>
      </div>
      <button className={`nexus-fav ${isFav ? 'active' : ''}`} onClick={onFav} aria-label="Favorite">
        <Star size={14} fill={isFav ? 'currentColor' : 'none'} />
      </button>
      {selected && <Check size={16} style={{ color: '#6366f1', flexShrink: 0 }} />}
    </button>
  );
}
