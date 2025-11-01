const { Terminal } = require('xterm');
const { FitAddon } = require('xterm-addon-fit');
const { WebLinksAddon } = require('xterm-addon-web-links');
const pty = require('node-pty');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

class TerminalApp {
  constructor() {
    this.tabs = [];
    this.activeTab = null;
    this.showHistory = false;
    this.commandHistory = [];
    this.selectedText = '';
    this.nextTabId = 1;
    this.savedPassword = null;
    this.lastOutputTime = {};
    this.outputMonitorInterval = null;
    this.hasOutputSinceCheck = {};
    
    // Settings
    this.settings = {
      fontFamily: 'JetBrains Mono',
      fontSize: 14,
      theme: 'github-dark',
      colorHue: 0,
      brightness: 100,
      bgOpacity: 100,
      beepOnIdle: false,
      showInputBox: false
    };
    
    this.themes = {
      'github-dark': {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        black: '#484f58',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#f0f6fc'
      },
      'dracula': {
        background: '#282a36',
        foreground: '#f8f8f2',
        cursor: '#f8f8f2',
        black: '#21222c',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#bd93f9',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#f8f8f2',
        brightBlack: '#6272a4',
        brightRed: '#ff6e6e',
        brightGreen: '#69ff94',
        brightYellow: '#ffffa5',
        brightBlue: '#d6acff',
        brightMagenta: '#ff92df',
        brightCyan: '#a4ffff',
        brightWhite: '#ffffff'
      },
      'monokai': {
        background: '#272822',
        foreground: '#f8f8f2',
        cursor: '#f8f8f0',
        black: '#272822',
        red: '#f92672',
        green: '#a6e22e',
        yellow: '#f4bf75',
        blue: '#66d9ef',
        magenta: '#ae81ff',
        cyan: '#a1efe4',
        white: '#f8f8f2',
        brightBlack: '#75715e',
        brightRed: '#f92672',
        brightGreen: '#a6e22e',
        brightYellow: '#f4bf75',
        brightBlue: '#66d9ef',
        brightMagenta: '#ae81ff',
        brightCyan: '#a1efe4',
        brightWhite: '#f9f8f5'
      },
      'solarized-dark': {
        background: '#002b36',
        foreground: '#839496',
        cursor: '#839496',
        black: '#073642',
        red: '#dc322f',
        green: '#859900',
        yellow: '#b58900',
        blue: '#268bd2',
        magenta: '#d33682',
        cyan: '#2aa198',
        white: '#eee8d5',
        brightBlack: '#002b36',
        brightRed: '#cb4b16',
        brightGreen: '#586e75',
        brightYellow: '#657b83',
        brightBlue: '#839496',
        brightMagenta: '#6c71c4',
        brightCyan: '#93a1a1',
        brightWhite: '#fdf6e3'
      },
      'nord': {
        background: '#2e3440',
        foreground: '#d8dee9',
        cursor: '#d8dee9',
        black: '#3b4252',
        red: '#bf616a',
        green: '#a3be8c',
        yellow: '#ebcb8b',
        blue: '#81a1c1',
        magenta: '#b48ead',
        cyan: '#88c0d0',
        white: '#e5e9f0',
        brightBlack: '#4c566a',
        brightRed: '#bf616a',
        brightGreen: '#a3be8c',
        brightYellow: '#ebcb8b',
        brightBlue: '#81a1c1',
        brightMagenta: '#b48ead',
        brightCyan: '#8fbcbb',
        brightWhite: '#eceff4'
      }
    };

    // Cache DOM elements
    this.tabsContainer = document.getElementById('tabs-container');
    this.terminalArea = document.getElementById('terminal-area');
    this.historyToggle = document.getElementById('history-toggle');
    this.historySidebar = document.getElementById('history-sidebar');
    this.historyList = document.getElementById('history-list');
    this.menuToggle = document.getElementById('menu-toggle');
    this.mainMenu = document.getElementById('main-menu');
    this.settingsPanel = document.getElementById('settings-panel');
    this.aliasPanel = document.getElementById('alias-panel');
    this.contextMenu = document.getElementById('context-menu');
    this.historyContextMenu = document.getElementById('history-context-menu');
    this.clearConsoleBtn = document.getElementById('clear-console');
    this.clearInputBtn = document.getElementById('clear-input');
    this.killProcessBtn = document.getElementById('kill-process');
    this.passwordLockBtn = document.getElementById('password-lock');
    this.focusedSplitIndex = 0; // Track which split pane is focused
    
    this.init();
  }

  init() {
    this.loadSettings();
    this.addTab();
    this.attachGlobalEvents();
    this.startHistoryMonitor();
    this.startOutputMonitor();
    this.applyThemeToUI();
  }

  loadSettings() {
    const saved = localStorage.getItem('terminalSettings');
    if (saved) {
      this.settings = { ...this.settings, ...JSON.parse(saved) };
    }
    
    const fontFamilySelect = document.getElementById('font-family');
    const fontSizeInput = document.getElementById('font-size');
    const themeSelect = document.getElementById('theme');
    const colorHueInput = document.getElementById('color-hue');
    const brightnessInput = document.getElementById('brightness');
    const bgOpacityInput = document.getElementById('bg-opacity');
    const beepCheckbox = document.getElementById('beep-on-idle');
    const showInputBoxCheckbox = document.getElementById('show-input-box');
    
    if (fontFamilySelect) fontFamilySelect.value = this.settings.fontFamily;
    if (fontSizeInput) fontSizeInput.value = this.settings.fontSize;
    if (themeSelect) themeSelect.value = this.settings.theme;
    if (colorHueInput) colorHueInput.value = this.settings.colorHue;
    if (brightnessInput) brightnessInput.value = this.settings.brightness;
    if (bgOpacityInput) bgOpacityInput.value = this.settings.bgOpacity;
    if (beepCheckbox) beepCheckbox.checked = this.settings.beepOnIdle;
    if (showInputBoxCheckbox) showInputBoxCheckbox.checked = this.settings.showInputBox;
    
    document.getElementById('font-size-value').textContent = this.settings.fontSize;
    document.getElementById('hue-value').textContent = this.settings.colorHue;
    document.getElementById('brightness-value').textContent = this.settings.brightness;
    document.getElementById('opacity-value').textContent = this.settings.bgOpacity;
    
    // Apply input box visibility
    this.toggleInputBox(this.settings.showInputBox);
  }

  saveSettings() {
    localStorage.setItem('terminalSettings', JSON.stringify(this.settings));
  }

  adjustColorWithHueAndBrightness(hex, hue, brightness) {
    // Convert hex to RGB
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    
    // Convert to HSL
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    
    // Apply hue rotation
    h = (h + hue / 360) % 1;
    
    // Apply brightness
    l = Math.max(0, Math.min(1, l * (brightness / 100)));
    
    // Convert back to RGB
    let r2, g2, b2;
    
    if (s === 0) {
      r2 = g2 = b2 = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      
      r2 = hue2rgb(p, q, h + 1/3);
      g2 = hue2rgb(p, q, h);
      b2 = hue2rgb(p, q, h - 1/3);
    }
    
    const toHex = (x) => {
      const hex = Math.round(x * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    
    return `#${toHex(r2)}${toHex(g2)}${toHex(b2)}`;
  }

  applyThemeToUI() {
    const theme = this.themes[this.settings.theme];
    const hue = this.settings.colorHue;
    const brightness = this.settings.brightness;
    const opacity = this.settings.bgOpacity / 100;
    
    const adjustedBg = this.adjustColorWithHueAndBrightness(theme.background, hue, brightness);
    const adjustedFg = this.adjustColorWithHueAndBrightness(theme.foreground, hue, brightness);
    
    // Parse RGB from adjusted background
    const bgR = parseInt(adjustedBg.slice(1, 3), 16);
    const bgG = parseInt(adjustedBg.slice(3, 5), 16);
    const bgB = parseInt(adjustedBg.slice(5, 7), 16);
    
    const lightBgR = Math.min(255, bgR + 15);
    const lightBgG = Math.min(255, bgG + 15);
    const lightBgB = Math.min(255, bgB + 15);
    
    document.documentElement.style.setProperty('--main-color', `rgba(${bgR}, ${bgG}, ${bgB}, ${opacity})`);
    document.documentElement.style.setProperty('--secondary-color', `rgba(${lightBgR}, ${lightBgG}, ${lightBgB}, ${opacity})`);
    document.documentElement.style.setProperty('--hue', `${hue}deg`);
     document.body.style.background = `rgba(${bgR}, ${bgG}, ${bgB}, ${opacity})`;
    document.body.style.color = adjustedFg;
    
    const container = document.querySelector('.terminal-container');
    if (container) container.style.background = `rgba(${bgR}, ${bgG}, ${bgB}, ${opacity})`;
    
    

  }
  
  startOutputMonitor() {
    this.outputMonitorInterval = setInterval(async () => {
      
      if (this.settings.beepOnIdle) {
        const now = Date.now();
  
        Object.keys(this.lastOutputTime).forEach(tabId => {
          const timeSinceOutput = now - this.lastOutputTime[tabId];
  
          // If had output before, but now idle for 3 seconds
          if (this.hasOutputSinceCheck[tabId] && timeSinceOutput >= 1000 && timeSinceOutput < 1200) {
            this.playBeep();
            this.hasOutputSinceCheck[tabId] = false;
          }
        });
      }
    }, 200);
  }

  playBeep() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  }

  startHistoryMonitor() {
    setInterval(() => {
      const historyPath = path.join(os.homedir(), '.bash_history');
      
      try {
        if (fs.existsSync(historyPath)) {
          const stats = fs.statSync(historyPath);
          if (!this.lastHistoryMtime || stats.mtimeMs > this.lastHistoryMtime) {
            this.lastHistoryMtime = stats.mtimeMs;
            
            const historyContent = fs.readFileSync(historyPath, 'utf8');
            const lines = historyContent.trim().split('\n').filter(l => l.trim());
            
            const uniqueCommands = [...new Set(lines.reverse())].slice(0, 50);
            
            if (JSON.stringify(uniqueCommands) !== JSON.stringify(this.commandHistory)) {
              this.commandHistory = uniqueCommands;
              
              if (this.showHistory) {
                this.renderHistorySidebar();
              }
            }
          }
        }
      } catch (err) {
        // Silently fail
      }
    }, 1000);
  }

  createTerminal(cwd, splitParent = null) {
    const currentTheme = this.themes[this.settings.theme];
    const hue = this.settings.colorHue;
    const brightness = this.settings.brightness;
    
    const tintedTheme = {};
    Object.keys(currentTheme).forEach(key => {
      tintedTheme[key] = this.adjustColorWithHueAndBrightness(currentTheme[key], hue, brightness);
    });
    
    const term = new Terminal({
      fontFamily: `"${this.settings.fontFamily}", "Courier New", monospace`,
      fontSize: this.settings.fontSize,
      fontWeight: 400,
      fontWeightBold: 600,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      theme: {
        ...tintedTheme,
        cursorAccent: tintedTheme.background,
        selection: '#388bfd40'
      },
      allowTransparency: this.settings.bgOpacity < 100,
      scrollback: 10000
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: term.cols,
      rows: term.rows,
      cwd: cwd || process.env.HOME || os.homedir(),
      env: {
        ...process.env,
        PROMPT_COMMAND: 'history -a',
        HISTFILE: path.join(os.homedir(), '.bash_history'),
        HISTFILESIZE: 10000,
        HISTSIZE: 10000
      }
    });

    const terminalId = Date.now() + Math.random();
    this.lastOutputTime[terminalId] = Date.now();
    this.hasOutputSinceCheck[terminalId] = false;

    ptyProcess.onData((data) => {
      term.write(data);
      this.lastOutputTime[terminalId] = Date.now();
      this.hasOutputSinceCheck[terminalId] = true;
    });

    term.onData((data) => {
      ptyProcess.write(data);
      
      if (data === '\r') {
        this.trackCommand(term);
      }
    });

    term.onResize(({ cols, rows }) => {
      ptyProcess.resize(cols, rows);
    });

    return { term, fitAddon, ptyProcess, splitParent, terminalId };
  }

  trackCommand(term) {
    // Commands tracked via history file monitoring
  }

  addTab() {
    const tabId = this.nextTabId++;
    const cwd = this.tabs.length > 0 ? this.tabs[this.tabs.length - 1].cwd : os.homedir();
    
    const { term, fitAddon, ptyProcess, terminalId } = this.createTerminal(cwd);
    
    const tab = {
      id: tabId,
      name: `${path.basename(cwd)}:bash`,
      term: term,
      fitAddon: fitAddon,
      ptyProcess: ptyProcess,
      element: null,
      terminalElement: null,
      cwd: cwd,
      splits: [],
      terminalId: terminalId
    };
    
    // Monitor cwd changes for tab name
    setInterval(() => {
      try {
        const procPath = `/proc/${ptyProcess.pid}/cwd`;
        if (fs.existsSync(procPath)) {
          const newCwd = fs.readlinkSync(procPath);
          if (newCwd !== tab.cwd) {
            tab.cwd = newCwd;
            tab.name = `${path.basename(newCwd)}:bash`;
            this.renderTabs();
          }
        }
      } catch (err) {}
    }, 2000);
    
    this.tabs.push(tab);
    this.renderTabs();
    this.switchTab(tabId);
  }

  renderTabs() {
    this.tabsContainer.innerHTML = '';
    
    const maxTabWidth = this.tabs.length > 5 ? 150 : 200;
    
    this.tabs.forEach(tab => {
      const tabEl = document.createElement('div');
      tabEl.className = `tab ${tab.id === this.activeTab ? 'active' : ''} color`;
      tabEl.dataset.tabId = tab.id;
      tabEl.style.maxWidth = `${maxTabWidth}px`;
      
      const icon = document.createElement('span');
      icon.className = 'tab-icon';
      icon.innerHTML = '▶';
      tabEl.appendChild(icon);
      
      const span = document.createElement('span');
      span.className = 'tab-label';
      span.textContent = tab.name;
      tabEl.appendChild(span);
      
      const detachBtn = document.createElement('button');
      detachBtn.className = 'detach-tab';
      detachBtn.innerHTML = '⧉';
      detachBtn.title = 'Detach tab to new window';
      detachBtn.dataset.tabId = tab.id;
      //tabEl.appendChild(detachBtn);
      
      if (this.tabs.length > 1) {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'close-tab';
        closeBtn.textContent = '✕';
        closeBtn.dataset.tabId = tab.id;
        tabEl.appendChild(closeBtn);
      }
      
      this.tabsContainer.appendChild(tabEl);
      tab.element = tabEl;
    });
    
    const addBtn = document.createElement('button');
    addBtn.className = 'add-tab';
    addBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>`;
    this.tabsContainer.appendChild(addBtn);
  }

  switchTab(tabId) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;
    
    this.tabs.forEach(t => {
      if (t.terminalElement) {
        t.terminalElement.style.display = 'none';
      }
      if (t.element) {
        t.element.classList.remove('active');
      }
    });
    
    if (!tab.terminalElement) {
      tab.terminalElement = document.createElement('div');
      tab.terminalElement.className = 'terminal-wrapper';
      
      // Check if this tab has splits
      if (tab.splits.length > 0) {
        tab.terminalElement.style.display = 'flex';
        tab.terminalElement.style.flexDirection = tab.splitDirection === 'horizontal' ? 'column' : 'row';
        tab.terminalElement.style.width = '100%';
        tab.terminalElement.style.height = '100%';
        
        tab.splits.forEach((split, index) => {
          const splitDiv = document.createElement('div');
          splitDiv.className = 'split-pane';
          splitDiv.style.flex = '1';
          splitDiv.style.overflow = 'hidden';
          splitDiv.style.position = 'relative';
          splitDiv.tabIndex = 0;
          split.term.open(splitDiv);
          splitDiv.addEventListener('click', () => {
            this.focusedSplitIndex = index;
          });
          
          // Track focus on splits
      /*     split.term.onDidFocus(() => {
            this.focusedSplitIndex = index;
          }); */

          tab.terminalElement.appendChild(splitDiv);
          
          setTimeout(() => split.fitAddon.fit(), 0);
        });
      } else {
        tab.terminalElement.style.width = '100%';
        tab.terminalElement.style.height = '100%';
        tab.term.open(tab.terminalElement);
   /*      tab.term.onDidFocus(() => {
          this.focusedSplitIndex = 0;
        }); */
      }
      
      this.terminalArea.appendChild(tab.terminalElement);
      
      // Enable drag and drop
      tab.terminalElement.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      
      tab.terminalElement.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
          const filePaths = Array.from(files).map(f => `"${f.path}"`).join(' ');
          if (tab.splits.length > 0) {
            tab.splits[this.focusedSplitIndex].ptyProcess.write(filePaths);
          } else {
            tab.ptyProcess.write(filePaths);
          }
        }
      });
      
      setTimeout(() => {
        if (tab.splits.length > 0) {
          tab.splits.forEach(s => s.fitAddon.fit());
        } else {
          tab.fitAddon.fit();
        }
      }, 0);
    }
    
    tab.terminalElement.style.display = tab.splits.length > 0 ? 'flex' : 'block';
    tab.element.classList.add('active');
    this.activeTab = tabId;
    
    if (tab.splits.length > 0) {
      tab.splits[this.focusedSplitIndex || 0].term.focus();
    } else {
      tab.term.focus();
    }
    
    const resizeHandler = () => {
      if (tab.splits.length > 0) {
        tab.splits.forEach(s => s.fitAddon.fit());
      } else {
        tab.fitAddon.fit();
      }
    };
    window.removeEventListener('resize', tab.resizeHandler);
    tab.resizeHandler = resizeHandler;
    window.addEventListener('resize', resizeHandler);
  }

  closeTab(tabId) {
    if (this.tabs.length === 1) return;
    
    const tabIndex = this.tabs.findIndex(t => t.id === tabId);
    const tab = this.tabs[tabIndex];
    
    if (tab) {
      tab.ptyProcess.kill();
      tab.term.dispose();
      
      if (tab.terminalElement) {
        tab.terminalElement.remove();
      }
      
      if (tab.resizeHandler) {
        window.removeEventListener('resize', tab.resizeHandler);
      }
      
      this.tabs.splice(tabIndex, 1);
      
      if (this.activeTab === tabId) {
        const newActiveTab = this.tabs[Math.max(0, tabIndex - 1)];
        this.switchTab(newActiveTab.id);
      }
      
      this.renderTabs();
    }
  }

  detachTab(tabId) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab || this.tabs.length === 1) return;
    
    if (typeof nw !== 'undefined') {
      const win = nw.Window.open('index.html', {
        width: 1000,
        height: 600,
        title: tab.name
      });
      
      win.on('loaded', () => {
        this.closeTab(tabId);
      });
    } else{
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('open-new-window');
      newWin.src = tab.getWebview().src;
    }
  }

  renderHistorySidebar() {
    if (this.commandHistory.length === 0) {
      this.historyList.innerHTML = '<div class="no-history">No commands yet</div>';
      return;
    }
    
    this.historyList.innerHTML = '';
    this.commandHistory.forEach(cmd => {
      const item = document.createElement('div');
      item.className = 'history-item';
      item.textContent = cmd;
      item.dataset.command = cmd;
      this.historyList.appendChild(item);
    });
  }

  attachGlobalEvents() {
    // Tab switching
    this.tabsContainer.addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (tab && !e.target.classList.contains('close-tab') && !e.target.classList.contains('detach-tab')) {
        const tabId = parseInt(tab.dataset.tabId);
        this.switchTab(tabId);
      }
    });

    // Close tab
    this.tabsContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('close-tab')) {
        e.stopPropagation();
        const tabId = parseInt(e.target.dataset.tabId);
        this.closeTab(tabId);
      }
    });

    // Detach tab
    this.tabsContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('detach-tab')) {
        e.stopPropagation();
        const tabId = parseInt(e.target.dataset.tabId);
        this.detachTab(tabId);
      }
    });

    // Add tab
    this.tabsContainer.addEventListener('click', (e) => {
      if (e.target.closest('.add-tab')) {
        this.addTab();
      }
    });

    // Toggle history
    this.historyToggle.addEventListener('click', () => {
      this.showHistory = !this.showHistory;
      this.historySidebar.style.display = this.showHistory ? 'flex' : 'none';
      this.historyToggle.classList.toggle('active', this.showHistory);
      
      if (this.showHistory) {
        this.settingsPanel.style.display = 'none';
        this.aliasPanel.style.display = 'none';
        this.mainMenu.style.display = 'none';
        this.renderHistorySidebar();
      }
      
      const tab = this.tabs.find(t => t.id === this.activeTab);
      if (tab) {
        setTimeout(() => {
          tab.fitAddon.fit();
          tab.term.focus();
        }, 100);
      }
    });

    // Menu toggle
    this.menuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = this.mainMenu.style.display === 'block';
      this.mainMenu.style.display = isVisible ? 'none' : 'block';
      
      if (!isVisible) {
        const rect = this.menuToggle.getBoundingClientRect();
        this.mainMenu.style.left = (rect.left - 150) + 'px';
        this.mainMenu.style.top = (rect.bottom + 5) + 'px';
      }
    });

    // Menu actions
    this.mainMenu.addEventListener('click', (e) => {
      const action = e.target.closest('.menu-item')?.dataset.action;
      if (action) {
        this.handleMenuAction(action);
        this.mainMenu.style.display = 'none';
      }
    });

    // Clear console and kill process
    this.clearConsoleBtn.addEventListener('click', () => {
      const tab = this.tabs.find(t => t.id === this.activeTab);
      let currTab=null;
      if (tab) {
        if (tab.splits.length > 0) {
          currTab=tab.splits[this.focusedSplitIndex || 0];
        }
        else{
          currTab=tab;
        }
        currTab.ptyProcess.write('\x03'); // Ctrl+C
        setTimeout(() => {
          currTab.term.clear();
          currTab.term.focus();
        }, 100);
      }
    });

    // Clear input
    this.clearInputBtn.addEventListener('click', () => {
      const tab = this.tabs.find(t => t.id === this.activeTab);
      let currTab=null;
      if (tab) {
        if (tab.splits.length > 0) {
          currTab=tab.splits[this.focusedSplitIndex || 0];
        }
        else{
          currTab=tab;
        }
        currTab.ptyProcess.write('\x15'); // Ctrl+U
        currTab.term.focus();
      }
    });

    // Kill process
    this.killProcessBtn.addEventListener('click', () => {
      const tab = this.tabs.find(t => t.id === this.activeTab);
      let currTab=null;
      if (tab) {
        if (tab.splits.length > 0) {
          currTab=tab.splits[this.focusedSplitIndex || 0];
        }
        else{
          currTab=tab;
        }
        currTab.ptyProcess.write('\x03'); // Ctrl+C
      }
    });

    // Password lock
    this.passwordLockBtn.addEventListener('click', () => {
      if (this.savedPassword) {
        const tab = this.tabs.find(t => t.id === this.activeTab);
        if (tab) {
          if (tab.splits.length > 0) {
            tab.splits[this.focusedSplitIndex || 0].ptyProcess.write(this.savedPassword + '\r');
          } else {
            tab.ptyProcess.write(this.savedPassword + '\r');
          }
        }
      } else {
        document.getElementById('password-overlay').style.display = 'flex';
      }
    });

    // Right-click password lock to change password
    this.passwordLockBtn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.savedPassword) {
        document.getElementById('password-overlay').style.display = 'flex';
        document.getElementById('password-input').value = '';
      }
    });

    // Password dialog
    document.getElementById('save-password').addEventListener('click', () => {
      const pwd = document.getElementById('password-input').value;
      if (pwd) {
        this.savedPassword = pwd;
        this.passwordLockBtn.classList.add('active');
      }
      document.getElementById('password-overlay').style.display = 'none';
      document.getElementById('password-input').value = '';
    });

    document.getElementById('cancel-password').addEventListener('click', () => {
      document.getElementById('password-overlay').style.display = 'none';
      document.getElementById('password-input').value = '';
    });

    // Execute from history
    this.historyList.addEventListener('click', (e) => {
      const historyItem = e.target.closest('.history-item');
      if (historyItem) {
        const command = historyItem.dataset.command;
        const tab = this.tabs.find(t => t.id === this.activeTab);
        if (tab) {
          if (tab.splits.length > 0) {
            tab.splits[this.focusedSplitIndex || 0].ptyProcess.write(command + '\r');
          } else {
            tab.ptyProcess.write(command + '\r');
          }
        }
      }
    });

    // History context menu
    this.historyList.addEventListener('contextmenu', (e) => {
      const historyItem = e.target.closest('.history-item');
      if (historyItem) {
        e.preventDefault();
        this.selectedHistoryCommand = historyItem.dataset.command;
        this.showHistoryContextMenu(e.clientX, e.clientY);
      }
    });

    // Context menu
    document.addEventListener('contextmenu', (e) => {
      const tab = this.tabs.find(t => t.id === this.activeTab);
      if (!tab) return;
      
      const selection = tab.term.getSelection().trim();
      
      if (e.target.closest('.terminal-area')) {
        e.preventDefault();
        this.selectedText = selection;
        this.showContextMenu(e.clientX, e.clientY, !selection);
      }
    });

    // Close menus on click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.context-menu') && !e.target.closest('.dropdown-menu')) {
        this.hideContextMenu();
        this.hideHistoryContextMenu();
        this.mainMenu.style.display = 'none';
      }
    });

    // Handle context menu actions
    this.contextMenu.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action) {
        e.stopPropagation();
        this.handleContextAction(action);
      }
    });

    // Handle history context menu actions
    this.historyContextMenu.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action) {
        e.stopPropagation();
        this.handleHistoryContextAction(action);
      }
    });

    // Settings - auto-save on change
    document.getElementById('font-family').addEventListener('change', () => {
      this.settings.fontFamily = document.getElementById('font-family').value;
      this.saveSettings();
      this.applySettings();
    });

    document.getElementById('font-size').addEventListener('input', (e) => {
      document.getElementById('font-size-value').textContent = e.target.value;
      this.settings.fontSize = parseInt(e.target.value);
      this.saveSettings();
      this.applySettings();
    });

    document.getElementById('theme').addEventListener('change', () => {
      this.settings.theme = document.getElementById('theme').value;
      this.saveSettings();
      this.applySettings();
    });

    document.getElementById('color-hue').addEventListener('input', (e) => {
      document.getElementById('hue-value').textContent = e.target.value;
      this.settings.colorHue = parseInt(e.target.value);
      this.saveSettings();
      this.applySettings();
    });

    document.getElementById('brightness').addEventListener('input', (e) => {
      document.getElementById('brightness-value').textContent = e.target.value;
      this.settings.brightness = parseInt(e.target.value);
      this.saveSettings();
      this.applySettings();
    });

    document.getElementById('bg-opacity').addEventListener('input', (e) => {
      document.getElementById('opacity-value').textContent = e.target.value;
      this.settings.bgOpacity = parseInt(e.target.value);
      this.saveSettings();
      this.applySettings();
    });

    document.getElementById('beep-on-idle').addEventListener('change', (e) => {
      this.settings.beepOnIdle = e.target.checked;
      this.saveSettings();
    });

    document.getElementById('show-input-box').addEventListener('change', (e) => {
      this.settings.showInputBox = e.target.checked;
      this.saveSettings();
      this.toggleInputBox(e.target.checked);
      this.historySidebar.classList.toggle("input-on");
      this.terminalArea.classList.toggle("input-on");
    });

    // Close buttons for panels
    document.getElementById('close-settings').addEventListener('click', () => {
      this.settingsPanel.style.display = 'none';
      const tab = this.tabs.find(t => t.id === this.activeTab);
      if (tab) {
        setTimeout(() => {
          if (tab.splits.length > 0) {
            tab.splits.forEach(s => s.fitAddon.fit());
          } else {
            tab.fitAddon.fit();
          }
          (tab.splits[0]?.term || tab.term).focus();
        }, 100);
      }
    });

    document.getElementById('close-aliases').addEventListener('click', () => {
      this.aliasPanel.style.display = 'none';
      const tab = this.tabs.find(t => t.id === this.activeTab);
      if (tab) {
        setTimeout(() => {
          if (tab.splits.length > 0) {
            tab.splits.forEach(s => s.fitAddon.fit());
          } else {
            tab.fitAddon.fit();
          }
          (tab.splits[0]?.term || tab.term).focus();
        }, 100);
      }
    });

    // Alias management
    document.getElementById('add-alias').addEventListener('click', () => {
      this.addAliasField();
    });

    document.getElementById('save-aliases').addEventListener('click', () => {
      this.saveAliases();
    });

    // Bottom input box
    const bottomInput = document.getElementById('bottom-input');
    let lastInputValue = '';
    
    bottomInput.addEventListener('input', (e) => {
      const tab = this.tabs.find(t => t.id === this.activeTab);
      if (!tab) return;
      
      const newValue = e.target.value;
      const ptyProcess = tab.splits.length > 0 ? tab.splits[this.focusedSplitIndex || 0].ptyProcess : tab.ptyProcess;
      
      // Clear terminal line and type new value
      if (lastInputValue.length > 0) {
        ptyProcess.write('\x15'); // Ctrl+U to clear line
      }
      ptyProcess.write(newValue);
      lastInputValue = newValue;
    });

    bottomInput.addEventListener('keydown', (e) => {
      const tab = this.tabs.find(t => t.id === this.activeTab);
      if (!tab) return;
      
      const ptyProcess = tab.splits.length > 0 ? tab.splits[this.focusedSplitIndex || 0].ptyProcess : tab.ptyProcess;
      
      if (e.key === 'Enter') {
        ptyProcess.write('\r');
        bottomInput.value = '';
        lastInputValue = '';
      } else if (e.key === 'Tab') {
        e.preventDefault();
        ptyProcess.write('\t');
      }
    });

    // Keep terminal focused
    document.addEventListener('mousedown', (e) => {
      const isToolbarBtn = e.target.closest('.toolbar-btn') || 
                          e.target.closest('.history-toggle') ||
                          e.target.closest('.add-tab') ||
                          e.target.closest('.close-tab') ||
                          e.target.closest('.detach-tab');
      
      if (isToolbarBtn) {
        e.preventDefault();
        
        setTimeout(() => {
          const tab = this.tabs.find(t => t.id === this.activeTab);
          if (tab) {
            tab.term.focus();
          }
        }, 0);
      }
    });
  }

  handleMenuAction(action) {
    switch (action) {
      case 'new-window':
        this.openNewWindow();
        break;
      case 'control-aliases':
        this.showAliasManager();
        break;
      case 'settings':
        this.showSettings();
        break;
    }
  }

  openNewWindow() {
    if (typeof nw !== 'undefined') {
      nw.Window.open('index.html', {
        width: 1200,
        height: 800
      });
    } else {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('open-new-window');
    }
  }

  showSettings() {
    this.settingsPanel.style.display = 'block';
    this.settingsPanel.style.position = 'fixed';
    this.settingsPanel.style.top = '42px';
    this.settingsPanel.style.right = '0';
    this.settingsPanel.style.bottom = '0';
    this.settingsPanel.style.width = '100%';
    this.settingsPanel.style.zIndex = '100';
    
    this.historySidebar.style.display = 'none';
    this.aliasPanel.style.display = 'none';
    this.showHistory = false;
    this.historyToggle.classList.remove('active');
  }

  showAliasManager() {
    this.aliasPanel.style.display = 'block';
    this.aliasPanel.style.position = 'fixed';
    this.aliasPanel.style.top = '42px';
    this.aliasPanel.style.right = '0';
    this.aliasPanel.style.bottom = '0';
    this.aliasPanel.style.width = '100%';
    this.aliasPanel.style.zIndex = '100';
    
    this.historySidebar.style.display = 'none';
    this.settingsPanel.style.display = 'none';
    this.showHistory = false;
    this.historyToggle.classList.remove('active');
    
    this.loadAliases();
  }

  loadAliases() {
    const bashrcPath = path.join(os.homedir(), '.bashrc');
    const aliasList = document.getElementById('alias-list');
    aliasList.innerHTML = '';
    
    try {
      if (fs.existsSync(bashrcPath)) {
        const content = fs.readFileSync(bashrcPath, 'utf8');
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
          const match = line.match(/^\s*alias\s+([^=]+)=['"](.+)['"]\s*$/);
          if (match) {
            this.addAliasField(match[1].trim(), match[2].trim(), index);
          }
        });
      }
    } catch (err) {
      console.error('Error reading .bashrc:', err);
    }
    
    if (aliasList.children.length === 0) {
      this.addAliasField();
    }
  }

  addAliasField(name = '', command = '', lineIndex = -1) {
    const aliasList = document.getElementById('alias-list');
    
    const aliasItem = document.createElement('div');
    aliasItem.className = 'alias-item';
    aliasItem.dataset.lineIndex = lineIndex;
    
    aliasItem.innerHTML = `
      <input type="text" class="alias-name" placeholder="Alias name" value="${name}">
      <input type="text" class="alias-command" placeholder="Command" value="${command}">
      <button class="remove-alias">✕</button>
    `;
    
    aliasItem.querySelector('.remove-alias').addEventListener('click', () => {
      aliasItem.remove();
    });
    
    aliasList.appendChild(aliasItem);
  }

  saveAliases() {
    const bashrcPath = path.join(os.homedir(), '.bashrc');
    
    try {
      let content = '';
      if (fs.existsSync(bashrcPath)) {
        content = fs.readFileSync(bashrcPath, 'utf8');
      }
      
      const lines = content.split('\n');
      const newLines = [];
      
      // Remove old aliases
      lines.forEach(line => {
        if (!line.match(/^\s*alias\s+/)) {
          newLines.push(line);
        }
      });
      
      // Add new aliases
      const aliasItems = document.querySelectorAll('.alias-item');
      aliasItems.forEach(item => {
        const name = item.querySelector('.alias-name').value.trim();
        const command = item.querySelector('.alias-command').value.trim();
        
        if (name && command) {
          newLines.push(`alias ${name}="${command}"`);
        }
      });
      
      fs.writeFileSync(bashrcPath, newLines.join('\n'), 'utf8');
      
      // Reload bash
      const tab = this.tabs.find(t => t.id === this.activeTab);
      if (tab) {
        tab.ptyProcess.write('source ~/.bashrc\r');
      }
      
      alert('Aliases saved! Restart bash or run: source ~/.bashrc');
    } catch (err) {
      alert('Error saving aliases: ' + err.message);
    }
  }

  toggleInputBox(show) {
    const inputBoxContainer = document.getElementById('input-box-container');
    const terminalArea = document.getElementById('terminal-area');
    
    if (show) {
      inputBoxContainer.style.display = 'block';
      terminalArea.style.bottom = '40px';
    } else {
      inputBoxContainer.style.display = 'none';
      terminalArea.style.bottom = '0';
    }
    
    // Refit all terminals
    this.tabs.forEach(tab => {
      if (tab.splits.length > 0) {
        setTimeout(() => tab.splits.forEach(s => s.fitAddon.fit()), 100);
      } else if (tab.fitAddon) {
        setTimeout(() => tab.fitAddon.fit(), 100);
      }
    });
  }

  applySettings() {
    const currentTheme = this.themes[this.settings.theme];
    const hue = this.settings.colorHue;
    const brightness = this.settings.brightness;
    
    const tintedTheme = {};
    Object.keys(currentTheme).forEach(key => {
      tintedTheme[key] = this.adjustColorWithHueAndBrightness(currentTheme[key], hue, brightness);
    });
    
    this.tabs.forEach(tab => {
      // Update main terminal
      tab.term.options.fontFamily = `"${this.settings.fontFamily}", "Courier New", monospace`;
      tab.term.options.fontSize = this.settings.fontSize;
      tab.term.options.allowTransparency = this.settings.bgOpacity < 100;
      tab.term.options.theme = {
        ...tintedTheme,
        cursorAccent: tintedTheme.background,
        selection: '#388bfd40'
      };
      
      // Update split terminals
      if (tab.splits.length > 0) {
        tab.splits.forEach(split => {
          split.term.options.fontFamily = `"${this.settings.fontFamily}", "Courier New", monospace`;
          split.term.options.fontSize = this.settings.fontSize;
          split.term.options.allowTransparency = this.settings.bgOpacity < 100;
          split.term.options.theme = {
            ...tintedTheme,
            cursorAccent: tintedTheme.background,
            selection: '#388bfd40'
          };
        });
      }
      
      setTimeout(() => {
        if (tab.splits.length > 0) {
          tab.splits.forEach(s => s.fitAddon.fit());
        } else {
          tab.fitAddon.fit();
        }
      }, 100);
    });
    
    this.applyThemeToUI();
  }

  executeCommand(command) {
    if (!command.trim()) return;

    let processedCommand = command.trim();
    
    // Auto-add sudo - check if command starts with package manager
    const needsSudo = [
      'pacman ',
      'apt-get ',
      'apt ',
      'dnf '
    ];
    
    for (const cmd of needsSudo) {
      if (processedCommand.startsWith(cmd) && !processedCommand.startsWith('sudo ')) {
        processedCommand = 'sudo ' + processedCommand;
        break;
      }
    }

    const tab = this.tabs.find(t => t.id === this.activeTab);
    if (!tab) return;
    
    tab.commandHistory = tab.commandHistory || [];
    tab.commandHistory.push(processedCommand);
    tab.historyIndex = -1;
    
    this.commandHistory = [processedCommand, ...this.commandHistory.filter(cmd => cmd !== processedCommand)].slice(0, 50);
    
    if (this.showHistory) {
      this.renderHistorySidebar();
    }

    // Send to focused split or main terminal
    if (tab.splits.length > 0) {
      tab.splits[this.focusedSplitIndex || 0].ptyProcess.write(processedCommand + '\r');
      tab.splits[this.focusedSplitIndex || 0].term.focus();
    } else {
      tab.ptyProcess.write(processedCommand + '\r');
      tab.term.focus();
    }
  }

  showContextMenu(x, y, emptyClick = false) {
    const packageItems = this.contextMenu.querySelectorAll('[data-action="pacman"], [data-action="yay"], [data-action="apt"], [data-action="dnf"], [data-action="search"]');
    packageItems.forEach(item => {
      item.style.display = emptyClick ? 'none' : 'block';
    });
    
    this.contextMenu.querySelectorAll('.context-divider').forEach((div, idx) => {
      if ((idx === 2 || idx === 3) && emptyClick) {
        div.style.display = 'none';
      } else {
        div.style.display = 'block';
      }
    });
    
    this.contextMenu.style.display = 'block';
    this.contextMenu.style.left = '0px';
    this.contextMenu.style.top = '0px';
    
    requestAnimationFrame(() => {
      const menuRect = this.contextMenu.getBoundingClientRect();
      const menuWidth = menuRect.width;
      const menuHeight = menuRect.height;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      
      let adjustedX = Math.max(5, Math.min(x, windowWidth - menuWidth - 5));
      let adjustedY = Math.max(5, Math.min(y, windowHeight - menuHeight - 5));
      
      this.contextMenu.style.left = adjustedX + 'px';
      this.contextMenu.style.top = adjustedY + 'px';
    });
  }

  hideContextMenu() {
    this.contextMenu.style.display = 'none';
  }

  showHistoryContextMenu(x, y) {
    this.historyContextMenu.style.display = 'block';
    this.historyContextMenu.style.left = '0px';
    this.historyContextMenu.style.top = '0px';
    
    requestAnimationFrame(() => {
      const menuRect = this.historyContextMenu.getBoundingClientRect();
      const menuWidth = menuRect.width;
      const menuHeight = menuRect.height;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      
      let adjustedX = Math.max(5, Math.min(x, windowWidth - menuWidth - 5));
      let adjustedY = Math.max(5, Math.min(y, windowHeight - menuHeight - 5));
      
      this.historyContextMenu.style.left = adjustedX + 'px';
      this.historyContextMenu.style.top = adjustedY + 'px';
    });
  }

  hideHistoryContextMenu() {
    this.historyContextMenu.style.display = 'none';
  }

  handleContextAction(action) {
    const tab = this.tabs.find(t => t.id === this.activeTab);
    if (!tab) return;
    
    switch (action) {
      case 'copy':
        if (typeof nw !== 'undefined') {
          nw.Clipboard.get().set(this.selectedText, 'text');
        } else {
          navigator.clipboard.writeText(this.selectedText);
        }
        break;
      case 'paste':
        if (typeof nw !== 'undefined') {
          const clipText = nw.Clipboard.get().get('text');
          tab.ptyProcess.write(clipText);
        } else {
          navigator.clipboard.readText().then(text => {
            tab.ptyProcess.write(text);
          });
        }
        break;
      case 'delete-selection':
        if (this.selectedText) {
          tab.ptyProcess.write('\x08'.repeat(this.selectedText.length));
        }
        break;
      case 'open-folder':
        this.openCurrentFolder(tab);
        break;
      case 'split-horizontal':
        this.splitTerminal(tab, 'horizontal');
        break;
      case 'split-vertical':
        this.splitTerminal(tab, 'vertical');
        break;
      case 'pacman':
        this.executeCommand(`sudo pacman -S ${this.selectedText}`);
        break;
      case 'yay':
        this.executeCommand(`yay -S ${this.selectedText}`);
        break;
      case 'apt':
        this.executeCommand(`sudo apt-get install ${this.selectedText}`);
        break;
      case 'dnf':
        this.executeCommand(`sudo dnf install ${this.selectedText}`);
        break;
      case 'search':
        exec(`xdg-open "https://www.google.com/search?q=${encodeURIComponent(this.selectedText)}"`);
        break;
    }
    
    this.hideContextMenu();
  }

  openCurrentFolder(tab) {
    try {
      const procPath = `/proc/${tab.ptyProcess.pid}/cwd`;
      if (fs.existsSync(procPath)) {
        const cwd = fs.readlinkSync(procPath);
        exec(`xdg-open "${cwd}"`);
      } else {
        exec(`xdg-open "${os.homedir()}"`);
      }
    } catch (err) {
      exec(`xdg-open "${os.homedir()}"`);
    }
  }

  splitTerminal(tab, direction) {
    if (tab.splits.length >= 2) {
      alert('Maximum 2 splits per tab');
      return;
    }
    
    tab.splitDirection = direction;
    
    // Create new terminal for split
    const { term, fitAddon, ptyProcess, terminalId } = this.createTerminal(tab.cwd);
    
    // If no splits yet, add the main terminal as first split
    if (tab.splits.length === 0) {
      tab.splits.push({
        term: tab.term,
        fitAddon: tab.fitAddon,
        ptyProcess: tab.ptyProcess,
        terminalId: tab.terminalId
      });
    }
    
    // Add new split
    tab.splits.push({
      term,
      fitAddon,
      ptyProcess,
      terminalId
    });
    
    // Recreate terminal element
    if (tab.terminalElement) {
      tab.terminalElement.remove();
      tab.terminalElement = null;
    }
    
    // Re-render the tab
    this.switchTab(tab.id);
  }

  handleHistoryContextAction(action) {
    const tab = this.tabs.find(t => t.id === this.activeTab);
    if (!tab || !this.selectedHistoryCommand) return;
    
    switch (action) {
      case 'execute':
        if (tab.splits.length > 0) {
          tab.splits[this.focusedSplitIndex || 0].ptyProcess.write(this.selectedHistoryCommand + '\r');
        } else {
          tab.ptyProcess.write(this.selectedHistoryCommand + '\r');
        }
        break;
      case 'copy-to-input':
        if (tab.splits.length > 0) {
          tab.splits[this.focusedSplitIndex || 0].ptyProcess.write(this.selectedHistoryCommand);
        } else {
          tab.ptyProcess.write(this.selectedHistoryCommand);
        }
        (tab.splits[this.focusedSplitIndex || 0]?.term || tab.term).focus();
        break;
      case 'copy':
        if (typeof nw !== 'undefined') {
          nw.Clipboard.get().set(this.selectedHistoryCommand, 'text');
        } else {
          navigator.clipboard.writeText(this.selectedHistoryCommand);
        }
        break;
    }
    
    this.hideHistoryContextMenu();
  }
}

// Initialize app
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new TerminalApp());
} else {
  new TerminalApp();
}