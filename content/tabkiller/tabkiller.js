var TabKiller = {

	init : function()
	{
		window.removeEventListener('load', this, false);

		if (this.getPref('tabkiller.disabled')) {
			aTabBrowser.__tabkiller__initialized = true;
			document.documentElement.removeAttribute('tabkiller-enabled');
			return;
		}

		this.killTabbrowser(document.getElementById('content'));

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

		var menu = document.getElementById('historyUndoMenu');
		if (menu) {
			const STRBUNDLE = Components
					.classes['@mozilla.org/intl/stringbundle;1']
					.getService(Components.interfaces.nsIStringBundleService);
			var msg = STRBUNDLE.createBundle('chrome://tabkiller/locale/tabkiller.properties');
			menu.setAttribute('label', msg.GetStringFromName('undo_close_window'));
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
			if (TabKiller.tempDisabled) {
				return this.__tabkiller__originalAddTab.apply(this, arguments);
			}

			var browserURI = location.href;
			var openWindow = TabKiller.getPref('tabkiller.openWindowInsteadOfTab');
			if (openWindow) {
				window.openDialog(browserURI, '_blank', 'chrome,all,dialog=no', aURI, aCharset, aReferrer);
			}
			else {
				this.loadURI(aURI, aReferrer, aCharset);
			}
			return this.selectedTab;
		};

		aTabBrowser.removeTab = function(aTab) {
			if (TabKiller.tempDisabled) {
				return this.__tabkiller__originalRemoveTab.apply(this, arguments);
			}

			var closeWindow = TabKiller.getPref('tabkiller.closeWindowInsteadOfTab');
			if (closeWindow) {
				if ('TryToCloseWindow' in window)
					window.TryToCloseWindow();
				else if ('TryToCloseBrowserWindow' in window)
					window.TryToCloseBrowserWindow();
				else
					window.close();
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
	},,

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
		switch (aEvent)
		{
			case 'load':
				this.init();
				break;
		}
	}

};


TabKiller.__proto__ = window['piro.sakura.ne.jp'].prefs;
window.addEventListener('load', TabKiller, false);
