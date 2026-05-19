// icons.jsx — minimal inline-SVG icon set (lucide-style stroked, 1.75 weight)
// All icons take {size, className, style}. Default 14px, stroke=currentColor.

const _i = (path, vb = "0 0 24 24") => ({ size = 14, className, style, strokeWidth = 1.75 }) => (
  <svg width={size} height={size} viewBox={vb} fill="none" stroke="currentColor"
       strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
       className={className} style={style} aria-hidden="true">
    {path}
  </svg>
);

const Icon = {
  // Brand: compass / aviator's pilot mark
  Compass: ({ size = 22, className, style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style} aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <path d="M12 4 L14 11 L12 13 L10 11 Z" fill="currentColor" opacity="0.95" />
      <path d="M12 20 L10 13 L12 11 L14 13 Z" fill="currentColor" opacity="0.35" />
      <line x1="12" y1="2" x2="12" y2="3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="20.4" x2="12" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="2" y1="12" x2="3.6" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="20.4" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  Plus: _i(<path d="M12 5v14M5 12h14" />),
  Search: _i(<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>),
  Command: _i(<path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />),
  ChevronRight: _i(<path d="m9 18 6-6-6-6" />),
  ChevronDown: _i(<path d="m6 9 6 6 6-6" />),
  ChevronLeft: _i(<path d="m15 18-6-6 6-6" />),
  ChevronsLeft: _i(<><path d="m11 17-5-5 5-5" /><path d="m18 17-5-5 5-5" /></>),
  Folder: _i(<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />),
  FolderOpen: _i(<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />),
  GitBranch: _i(<><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></>),
  GitCommit: _i(<><circle cx="12" cy="12" r="3" /><line x1="3" y1="12" x2="9" y2="12" /><line x1="15" y1="12" x2="21" y2="12" /></>),
  GitMerge: _i(<><circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M6 21V9a9 9 0 0 0 9 9" /></>),
  GitPullRequest: _i(<><circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" /></>),
  Play: _i(<polygon points="6 3 20 12 6 21 6 3" fill="currentColor" stroke="none" />),
  PlayCircle: _i(<><circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" /></>),
  StopCircle: _i(<><circle cx="12" cy="12" r="10" /><rect x="9" y="9" width="6" height="6" fill="currentColor" stroke="none" rx="1" /></>),
  Pause: _i(<><rect x="6" y="4" width="4" height="16" rx="0.5" /><rect x="14" y="4" width="4" height="16" rx="0.5" /></>),
  Square: _i(<rect x="3" y="3" width="18" height="18" rx="2" />),
  Settings: _i(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>),
  Server: _i(<><rect x="2" y="3" width="20" height="8" rx="2" /><rect x="2" y="13" width="20" height="8" rx="2" /><line x1="6" y1="7" x2="6.01" y2="7" /><line x1="6" y1="17" x2="6.01" y2="17" /></>),
  Bell: _i(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>),
  Lock: _i(<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>),
  Users: _i(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
  History: _i(<><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><polyline points="3 3 3 8 8 8" /><path d="M12 7v5l3 3" /></>),
  FileText: _i(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="13" y2="17" /></>),
  Package: _i(<><path d="m7.5 4.27 9 5.15" /><path d="M21 8 12 3 3 8l9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="m12 13 9-5" /><path d="m3 8 9 5" /><path d="M12 13v8" /></>),
  Apple: _i(<><path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z" /><path d="M10 2c1 .5 2 2 2 5" /></>),
  Smartphone: _i(<><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></>),
  Gamepad: _i(<><line x1="6" y1="11" x2="10" y2="11" /><line x1="8" y1="9" x2="8" y2="13" /><line x1="15" y1="12" x2="15.01" y2="12" /><line x1="18" y1="10" x2="18.01" y2="10" /><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258A4 4 0 0 0 17.32 5Z" /></>),
  Box: _i(<><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>),
  Cloud: _i(<path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.78A6 6 0 0 0 4 13a4 4 0 0 0 0 6Z" />),
  Upload: _i(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>),
  Download: _i(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>),
  MessageSquare: _i(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />),
  Terminal: _i(<><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></>),
  Zap: _i(<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />),
  Check: _i(<polyline points="20 6 9 17 4 12" strokeWidth="2.25" />),
  CheckCircle: _i(<><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></>),
  X: _i(<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>),
  XCircle: _i(<><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></>),
  AlertCircle: _i(<><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>),
  AlertTriangle: _i(<><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>),
  Info: _i(<><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></>),
  MoreHorizontal: _i(<><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></>),
  MoreVertical: _i(<><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></>),
  RefreshCw: _i(<><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></>),
  Loader: _i(<><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /><line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" /></>),
  Eye: _i(<><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>),
  EyeOff: _i(<><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" y1="2" x2="22" y2="22" /></>),
  Copy: _i(<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>),
  Maximize: _i(<><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></>),
  Minimize: _i(<><path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" /><path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" /></>),
  Grid: _i(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>),
  List: _i(<><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>),
  Filter: _i(<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />),
  ArrowUpRight: _i(<><line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" /></>),
  ArrowRight: _i(<><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>),
  Database: _i(<><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14a9 3 0 0 0 18 0V5" /><path d="M3 12a9 3 0 0 0 18 0" /></>),
  Tag: _i(<><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" /><line x1="7" y1="7" x2="7.01" y2="7" /></>),
  Send: _i(<><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></>),
  Clock: _i(<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>),
  Calendar: _i(<><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>),
  Activity: _i(<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />),
  Sun: _i(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></>),
  Moon: _i(<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />),
  Sparkles: _i(<><path d="M12 3 13.9 8.5 19 10 13.9 11.5 12 17 10.1 11.5 5 10 10.1 8.5z" /><path d="M19 16l.8 2.4 2.4.8-2.4.8L19 22.4l-.8-2.4-2.4-.8 2.4-.8z" /><path d="M5 3l.6 1.8L7.4 5.4 5.6 6 5 7.8 4.4 6 2.6 5.4l1.8-.6z" /></>),
  Hash: _i(<><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></>),
  CornerDownRight: _i(<><polyline points="15 10 20 15 15 20" /><path d="M4 4v7a4 4 0 0 0 4 4h12" /></>),
  Wifi: _i(<><path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" /></>),
  Map: _i(<><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></>),
  Layers: _i(<><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>),
  Trash: _i(<><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>),
  Code: _i(<><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></>),
  Save: _i(<><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></>),
  Bug: _i(<><rect x="8" y="6" width="8" height="14" rx="4" /><path d="M19 7l-3 2M5 7l3 2M19 13h-3M5 13h3M19 19l-3-2M5 19l3-2M12 2v4" /></>),
  Image: _i(<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></>),
  Star: _i(<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />),
};

window.Icon = Icon;
