var TabKiller = {

	BEHAVIOR_ASK                 : -1,
	BEHAVIOR_REDIRECT_TO_CURRENT : 0,
	BEHAVIOR_REDIRECT_TO_WINDOW  : 1,
	BEHAVIOR_IGNORE              : 2,

	get strbundle()
	{
		if (!this._strbundle)
			this._strbundle = document.getElementById('tabkiller_bundle');
		return this._strbundle;
	},
	_strbundle : null,

	get PromptService()
	{
		if (!this._PromptService)
			this._PromptService = Components
					.classes['@mozilla.org/embedcomp/prompt-service;1']
					.getService(Components.interfaces.nsIPromptService);
		return this._PromptService;
	},
	_PromptService : null,


	init : function()
	{
		window.removeEventListener('load', this, false);

		if (this.getPref('extensions.tabkiller.disabled')) {
			aTabBrowser.__tabkiller__initialized = true;
			document.documentElement.removeAttribute('tabkiller-enabled');
			return;
		}

		this.killTabbrowser(document.getElementById('content'));

		// 「すべてタブで開く」の項目を消す
		if (window.HistoryMenu &&
			window.HistoryMenu.populateUndoSubmenu)
			eval(
				'window.HistoryMenu.populateUndoSubmenu = '+
				window.HistoryMenu.populateUndoSubmenu.toSource().replace(
					/undoPopup.appendChild\(document.createElement\("menuseparator"\)\);/i,
					'return;'
				)
			);

		var undoCloseTabMenu = document.getElementById('historyUndoMenu');
		if (document.getElementById('historyUndoWindowMenu')) {
			undoCloseTabMenu.setAttribute('collapsed', true);
		}
		else {
			undoCloseTabMenu.setAttribute('label', this.strbundle.getString('undo_close_window'));
			undoCloseTabMenu.removeAttribute('collapsed');

			if (window.closeWindow)
				eval(
					'window.closeWindow = '+
					window.closeWindow.toSource().replace(
						/\{/i,
						'{ TabKiller.addWindowToUndoCache();'
					)
				);

			if (window.undoCloseTab)
				eval(
					'window.undoCloseTab = '+
					window.undoCloseTab.toSource().replace(
						/ss.undoCloseTab\(/i,
						'TabKiller.restoreWindowFromUndoCache('
					)
				);
		}

		document.documentElement.setAttribute('tabkiller-enabled', true);
	},

	killTabbrowser : function(aTabBrowser)
	{
		if ('__tabkiller__initialized' in aTabBrowser) return;

		var tabs = this.getTabs(aTabBrowser);
		for (var i = tabs.length-1; i > -1; i--)
		{
			if (tabs[i] != aTabBrowser.selectedTab)
				aTabBrowser.removeTab(tabs[i]);
		}

		aTabBrowser.mStrip.collapsed = true;
		aTabBrowser.mStrip.hidden    = true;

		aTabBrowser.__tabkiller__originalAddTab    = aTabBrowser.addTab;
		aTabBrowser.__tabkiller__originalRemoveTab = aTabBrowser.removeTab;

		aTabBrowser.addTab = function(aURI, aReferrer, aCharset)
		{
			var sv = TabKiller;

			if (sv.tempDisabled) {
				return this.__tabkiller__originalAddTab.apply(this, arguments);
			}

			var browserURI = location.href;
			var behavior = sv.getPref('extensions.tabkiller.tabs.open.behavior');
			if (behavior == sv.BEHAVIOR_ASK) {
				var check = { value : false };
				var prompt = sv.PromptService;
				var strbundle = sv.strbundle;
				switch (prompt.confirmEx(
						window,
						strbundle.getString('tab_open_behavior_title'),
						strbundle.getString('tab_open_behavior_text'),
						(prompt.BUTTON_TITLE_IS_STRING * prompt.BUTTON_POS_0) |
						(prompt.BUTTON_TITLE_IS_STRING * prompt.BUTTON_POS_1) |
						(prompt.BUTTON_TITLE_IS_STRING * prompt.BUTTON_POS_2),
						strbundle.getString('tab_open_behavior_current'),
						strbundle.getString('tab_open_behavior_ignore'),
						strbundle.getString('tab_open_behavior_window'),
						strbundle.getString('tab_open_behavior_never'),
						check
					))
				{
					case 0: behavior = sv.BEHAVIOR_REDIRECT_TO_CURRENT; break;
					case 1: behavior = sv.BEHAVIOR_IGNORE; break;
					case 2: behavior = sv.BEHAVIOR_REDIRECT_TO_WINDOW; break;
				}
				if (check.value)
					sv.setPref('extensions.tabkiller.tabs.open.behavior', behavior);
			}
			switch (behavior)
			{
				case sv.BEHAVIOR_REDIRECT_TO_WINDOW:
					window.openDialog(browserURI, '_blank', 'chrome,all,dialog=no', aURI, aCharset, aReferrer);
					break;
				case sv.BEHAVIOR_REDIRECT_TO_CURRENT:
					this.loadURI(aURI, aReferrer, aCharset);
					break;
				default:
				case sv.BEHAVIOR_IGNORE:
					break;
			}
			return this.selectedTab;
		};

		aTabBrowser.removeTab = function(aTab) {
			var sv = TabKiller;

			if (sv.tempDisabled) {
				return this.__tabkiller__originalRemoveTab.apply(this, arguments);
			}

			var behavior = sv.getPref('extensions.tabkiller.tabs.close.behavior');
			if (behavior == sv.BEHAVIOR_ASK) {
				var check = { value : false };
				var prompt = sv.PromptService;
				var strbundle = sv.strbundle;
				switch (prompt.confirmEx(
						window,
						strbundle.getString('tab_close_behavior_title'),
						strbundle.getString('tab_close_behavior_text'),
						(prompt.BUTTON_TITLE_IS_STRING * prompt.BUTTON_POS_0) |
						(prompt.BUTTON_TITLE_IS_STRING * prompt.BUTTON_POS_1) |
						(prompt.BUTTON_TITLE_IS_STRING * prompt.BUTTON_POS_2),
						strbundle.getString('tab_close_behavior_current'),
						strbundle.getString('tab_close_behavior_ignore'),
						strbundle.getString('tab_close_behavior_window'),
						strbundle.getString('tab_close_behavior_never'),
						check
					))
				{
					case 0: behavior = sv.BEHAVIOR_REDIRECT_TO_CURRENT; break;
					case 1: behavior = sv.BEHAVIOR_IGNORE; break;
					case 2: behavior = sv.BEHAVIOR_REDIRECT_TO_WINDOW; break;
				}
				if (check.value)
					sv.setPref('extensions.tabkiller.tabs.close.behavior', behavior);
			}
			switch (behavior)
			{
				case sv.BEHAVIOR_REDIRECT_TO_WINDOW:
					if ('TryToCloseWindow' in window)
						window.TryToCloseWindow();
					else if ('TryToCloseBrowserWindow' in window)
						window.TryToCloseBrowserWindow();
					else
						window.close();
					break;
				case sv.BEHAVIOR_REDIRECT_TO_CURRENT:
					this.loadURI('about:blank');
					break;
				default:
				case sv.BEHAVIOR_IGNORE:
					break;
			}
			return aTab;
		};
		aTabBrowser.setStripVisibilityTo = function(aShow) {};
		aTabBrowser.getStripVisibility = function() { return false; }

		aTabBrowser.__tabkiller__initialized = true;
	},

	getTabs : function(aTabBrowser)
	{
		var tabs = aTabBrowser.ownerDocument.evaluate(
				'descendant::*[local-name()="tab"]',
				aTabBrowser.mTabContainer,
				null,
				XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
				null
			);
		var array = [];
		for (var i = 0, maxi = tabs.snapshotLength; i < maxi; i++)
		{
			array.push(tabs.snapshotItem(i));
		}
		return array;
	},

	addWindowToUndoCache : function()
	{
		const WindowManager = Components
				.classes['@mozilla.org/appshell/window-mediator;1']
				.getService(Components.interfaces.nsIWindowMediator);
		var targets = WindowManager.getEnumerator('navigator:browser', true),
			target,
			windows = [];
		while (targets.hasMoreElements())
		{
			target = targets.getNext().QueryInterface(Components.interfaces.nsIDOMWindowInternal);
			if (target != window)
				windows.push(target);
		}

		if (!windows.length) return;

		const SS = Components
					.classes['@mozilla.org/browser/sessionstore;1']
					.getService(Components.interfaces.nsISessionStore);
		var state = SS.getWindowState(window);
		var title = gBrowser.selectedTab.getAttribute('label');

		var current;
		var tabs;
		for (var i = 0; i < windows.length; i++)
		{
			windows[i].TabKiller.disable();

			current = windows[i].gBrowser.selectedTab;
			SS.setWindowState(windows[i], state, false);

			tabs = windows[i].TabKiller.getTabs(windows[i].gBrowser);
			for (var j = tabs.length-1; j > -1; j--)
			{
				if (tabs[j] != current) {
					tabs[j].setAttribute('label', title);
					windows[i].gBrowser.removeTab(tabs[j]);
				}
			}

			windows[i].TabKiller.enable();
		}
	},

	restoreWindowFromUndoCache : function(aWindow, aIndex)
	{
		this.disable();

		const SS = Components
					.classes['@mozilla.org/browser/sessionstore;1']
					.getService(Components.interfaces.nsISessionStore);
		var current = gBrowser.selectedTab;

		SS.undoCloseTab(aWindow, aIndex);
		var state = SS.getWindowState(window);

		var tabs = this.getTabs(gBrowser);
		var index = -1;
		for (var i = 0, maxi = tabs.length; i < maxi; i++)
		{
			if (index < 0 && tabs[i] != current) {
				index = i;
				/*
					セッションヒストリの項目数が1で且つlocationがabout:blankの時、
					nsISessionStoreはそのタブを履歴に残さない。
					つまり、これを逆手に取れば、「閉じたタブ」の履歴に残さずに
					タブを閉じることが出来るというわけ。
				*/
				tabs[i].linkedBrowser.contentWindow.location.replace('about:blank');
				break;
			}
		}
		var self = this;
		window.setTimeout(function() {
			var tabs = self.getTabs(gBrowser);
			for (var i = tabs.length-1; i > -1; i--)
			{
				if (tabs[i] != current)
					gBrowser.removeTab(tabs[i]);
			}
			self.enable();
			delete current;
		}, 0);

		if (index < 0) return;

		var newWin = window.openDialog(location.href, '_blank', 'chrome,all,dialog=no', 'about:blank');
		newWin.addEventListener('load', function() {
			newWin.setTimeout(function() {
				newWin.TabKiller.disable();

				index += newWin.TabKiller.getTabs(newWin.gBrowser).length;
				SS.setWindowState(newWin, state, false);
				delete state;

				var tabs = newWin.TabKiller.getTabs(newWin.gBrowser);
				newWin.gBrowser.selectedTab = tabs[index];
				newWin.focus();

				window.setTimeout(function() {
					for (var i = 0, maxi = tabs.length; i < maxi; i++)
					{
						if (i != index) {
							/*
								このタブは元のウィンドウのタブの複製で、セッションヒストリに
								複数の項目を含んでいる可能性がある。
								なので、セッションヒストリをすべて消してから閉じる。
							*/
							if (tabs[i].linkedBrowser.sessionHistory)
								tabs[i].linkedBrowser.sessionHistory.PurgeHistory(tabs[i].linkedBrowser.sessionHistory.count);
							tabs[i].linkedBrowser.contentWindow.location.replace('about:blank');
						}
					}
					window.setTimeout(function() {
						for (var i = tabs.length-1; i > -1; i--)
						{
							if (i != index)
								newWin.gBrowser.removeTab(tabs[i]);
						}
						newWin.TabKiller.enable();

						delete index;
						delete tabs;
						delete newWin;
					}, 0);
				}, 0);
			}, 0);
		}, false);
	},

	disable : function()
	{
		this.tempDisabled = true;
		gBrowser.mStrip.collapsed = false;
		gBrowser.mStrip.hidden    = false;
		gBrowser.mStrip.ordinal   = 65000;
		gBrowser.mStrip.style.overflow  = 'hidden !important';
		gBrowser.mStrip.style.maxHeight = '0 !important';
	},

	enable : function()
	{
		this.tempDisabled = false;
		window.setTimeout(function() {
			gBrowser.mStrip.collapsed = true;
			gBrowser.mStrip.hidden    = true;
		}, 0);
	},

	handleEvent : function(aEvent)
	{
		switch (aEvent.type)
		{
			case 'load':
				this.init();
				break;
		}
	}

};


TabKiller.__proto__ = window['piro.sakura.ne.jp'].prefs;
window.addEventListener('load', TabKiller, false);
