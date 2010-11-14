function TabKiller(aWindow)
{
	this.init(aWindow);
}
TabKiller.prototype = {

	BEHAVIOR_ASK                 : -1,
	BEHAVIOR_REDIRECT_TO_CURRENT : 0,
	BEHAVIOR_REDIRECT_TO_WINDOW  : 1,
	BEHAVIOR_IGNORE              : 2,

	get browser()
	{
		return this._window.gBrowser || this._window.document.getElementById('content');
	},

	get strbundle()
	{
		if (!this._strbundle)
			this._strbundle = require('lib/locale')
								.get(location.href.replace(/[^\/]+$), '')+
										'locale/tabkiller.properties');
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

	getTabStrip : function(aTabBrowser) 
	{
		var strip = aTabBrowser.mStrip;
		return (strip && strip.localName == 'hbox') ?
				strip :
				aTabBrowser.tabContainer.parentNode;
	},


	init : function(aWindow)
	{
		this._window = aWindow;

		this.initTabbrowser(this.browser);

/*
		// 「すべてタブで開く」の項目を消す
		if (window.HistoryMenu &&
			window.HistoryMenu.populateUndoSubmenu)
			eval('window.HistoryMenu.populateUndoSubmenu = '+window.HistoryMenu.populateUndoSubmenu.toSource().replace(
				/undoPopup.appendChild\(document.createElement\("menuseparator"\)\);/i,
				'return;'
			));

		var undoCloseTabMenu = document.getElementById('historyUndoMenu');
		if (document.getElementById('historyUndoWindowMenu')) {
			undoCloseTabMenu.setAttribute('collapsed', true);
		}
		else {
			undoCloseTabMenu.setAttribute('label', this.strbundle.getString('undo_close_window'));
			undoCloseTabMenu.removeAttribute('collapsed');

			if (window.closeWindow)
				eval('window.closeWindow = '+window.closeWindow.toSource().replace(
					/\{/i,
					'{ TabKiller.addWindowToUndoCache();'
				));

			if (window.undoCloseTab)
				eval('window.undoCloseTab = '+window.undoCloseTab.toSource().replace(
					/ss.undoCloseTab\(/i,
					'TabKiller.restoreWindowFromUndoCache('
				));
		}
*/
	},

	initTabbrowser : function(aTabBrowser)
	{
		var tabs = this.getTabs(aTabBrowser);
		tabs.forEach(function(aTab) {
			if (aTab == aTabBrowser.selectedTab) return;
			aTabBrowser.removeTab(aTab);
		});

		aTabBrowser.setStripVisibilityTo(false);

		var strip = this.getTabStrip(aTabBrowser);
		strip.collapsed = true;
		strip.hidden    = true;

		aTabBrowser.__tabkiller__originalAddTab    = aTabBrowser.addTab;
		aTabBrowser.__tabkiller__originalRemoveTab = aTabBrowser.removeTab;

		aTabBrowser.addTab = function(aURI, aReferrer, aCharset)
		{
			var sv = TabKiller;
			if (sv.tempDisabled) {
				return this.__tabkiller__originalAddTab.apply(this, arguments);
			}
			sv.performTabOpenRequest(this, aURI, aReferrer, aCharset);
			return this.selectedTab;
		};

		aTabBrowser.removeTab = function(aTab) {
			var sv = TabKiller;
			if (sv.tempDisabled) {
				return this.__tabkiller__originalRemoveTab.apply(this, arguments);
			}
			sv.performTabCloseRequest(this, aTab);
			return aTab;
		};
	},

	destroy : function()
	{
		this.destroyTabbrowser(this.browser);
		this._window = void(0);
	},

	destroyTabbrowser : function(aTabBrowser)
	{
	},

	performTabOpenRequest : function(aTabBrowser, aURI, aReferrer, aCharset)
	{
		var referrer = null,
			charset = null;
		if (aReferrer && typeof aReferrer == 'object') {
			if (aReferrer instanceof Components.interfaces.nsIURI) {
				referrer = aReferrer;
				charset = aCharset;
			}
			else {
				referrer = aReferrer.referrerURI;
				charset = aReferrer.charset;
			}
		}
		switch (this.getBehaviorForRequest('open', aURI))
		{
			case this.BEHAVIOR_REDIRECT_TO_WINDOW:
				this._window.openDialog(this._window.location.href, '_blank', 'chrome,all,dialog=no', aURI, charset, referrer);
				break;
			case this.BEHAVIOR_REDIRECT_TO_CURRENT:
				aTabBrowser.loadURI(aURI, referrer, charset);
				break;
			default:
			case this.BEHAVIOR_IGNORE:
				break;
		}
	},

	performTabCloseRequest : function(aTabBrowser, aTab)
	{
		switch (this.getBehaviorForRequest('close'))
		{
			case this.BEHAVIOR_REDIRECT_TO_WINDOW:
				if ('TryToCloseWindow' in window)
					this._window.TryToCloseWindow();
				else if ('TryToCloseBrowserWindow' in window)
					this._window.TryToCloseBrowserWindow();
				else
					this._window.close();
				break;
			case this.BEHAVIOR_REDIRECT_TO_CURRENT:
				aTab.linkedBrowser.loadURI('about:blank');
				break;
			default:
			case this.BEHAVIOR_IGNORE:
				break;
		}
	},

	getBehaviorForRequest : function(aType)
	{
		var behavior = this.getPref('extensions.tabkiller.tabs.'+aType+'.behavior');
		if (behavior != this.BEHAVIOR_ASK) return behavior;

		var args = Array.slice(arguments);
		args.shift();
		var check = { value : false };
		var prompt = this.PromptService;
		var strbundle = this.strbundle;
		switch (prompt.confirmEx(
				this._window,
				strbundle.getString('tab_'+aType+'_behavior_title'),
				strbundle.getFormattedString('tab_'+aType+'_behavior_text', args),
				(prompt.BUTTON_TITLE_IS_STRING * prompt.BUTTON_POS_0) |
				(prompt.BUTTON_TITLE_IS_STRING * prompt.BUTTON_POS_1) |
				(prompt.BUTTON_TITLE_IS_STRING * prompt.BUTTON_POS_2),
				strbundle.getString('tab_'+aType+'_behavior_current'),
				strbundle.getString('tab_'+aType+'_behavior_ignore'),
				strbundle.getString('tab_'+aType+'_behavior_window'),
				strbundle.getString('tab_'+aType+'_behavior_never'),
				check
			))
		{
			case 0: behavior = this.BEHAVIOR_REDIRECT_TO_CURRENT; break;
			case 1: behavior = this.BEHAVIOR_IGNORE; break;
			case 2: behavior = this.BEHAVIOR_REDIRECT_TO_WINDOW; break;
		}
		if (check.value)
			this.setPref('extensions.tabkiller.tabs.'+aType+'.behavior', behavior);

		return behavior;
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
		var state = SS.getWindowState(this._window);
		var title = this.browser.selectedTab.getAttribute('label');

		windows.forEach(function(aWindow) {
			aWindow.tabKiller.disable();

			current = aWindow.gBrowser.selectedTab;
			SS.setWindowState(aWindow, state, false);

			aWindow.tabKiller.getTabs(aWindow.gBrowser)
				.forEach(function(aTab) {
					if (aTab == current) return;
					aTab.setAttribute('label', title);
					aWindow.gBrowser.removeTab(aTab);
				});

			aWindow.setTimeout(function() {
				aWindow.tabKiller.enable();
			}, 10);
		}, this);
	},

	restoreWindowFromUndoCache : function(aWindow, aIndex)
	{
		this.disable();

		const SS = Components
					.classes['@mozilla.org/browser/sessionstore;1']
					.getService(Components.interfaces.nsISessionStore);
		var current = this.browser.selectedTab;

		SS.undoCloseTab(aWindow, aIndex);
		var state = SS.getWindowState(this._window);

		var index = -1;
		this.getTabs(this.browser).some(function(aTab, aIndex) {
			if (aTab == current) return false;
			index = aIndex;
			/*
				セッションヒストリの項目数が1で且つlocationがabout:blankの時、
				nsISessionStoreはそのタブを履歴に残さない。
				つまり、これを逆手に取れば、「閉じたタブ」の履歴に残さずに
				タブを閉じることが出来るというわけ。
			*/
			aTab.linkedBrowser.contentWindow.location.replace('about:blank');
			this.browser.removeTab(aTab);
			return true;
		}, this);

		var self = this;
		this._window.setTimeout(function() {
			self.enable();
			delete current;
		}, 10);

		if (index < 0) return;

		var newWin = this._window.openDialog(location.href, '_blank', 'chrome,all,dialog=no', 'about:blank');
		newWin.addEventListener('load', function() {
			newWin.removeEventListener('load', arguments.callee, false);
			newWin.setTimeout(function() {
				newWin.tabKiller.disable();

				index += newWin.tabKiller.getTabs(newWin.gBrowser).length;
				SS.setWindowState(newWin, state, false);
				delete state;

				var tabs = newWin.tabKiller.getTabs(newWin.gBrowser);
				newWin.gBrowser.selectedTab = tabs[index];
				newWin.focus();

				self._window.setTimeout(function() {
					tabs.forEach(function(aTab, aIndex) {
						if (aIndex == index) return;
						/*
							このタブは元のウィンドウのタブの複製で、セッションヒストリに
							複数の項目を含んでいる可能性がある。
							なので、セッションヒストリをすべて消してから閉じる。
						*/
						try {
							if (aTab.linkedBrowser.sessionHistory)
								aTab.linkedBrowser.sessionHistory.PurgeHistory(aTab.linkedBrowser.sessionHistory.count);
						}
						catch(e) {
						}
						aTab.linkedBrowser.contentWindow.location.replace('about:blank');
					});
					self._window.setTimeout(function() {
						tabs.forEach(function(aTab, aIndex) {
								if (aIndex == index) return;
								newWin.gBrowser.removeTab(aTab);
							});
						newWin.tabKiller.enable();

						delete index;
						delete tabs;
						delete newWin;
					}, 10);
				}, 10);
			}, 10);
		}, false);
	},

	disable : function()
	{
		this.tempDisabled = true;
		var strip = this.getTabStrip(this.browser);
		strip.collapsed = false;
		strip.hidden    = false;
		strip.ordinal   = 65000;
		strip.style.overflow  = 'hidden !important';
		strip.style.maxHeight = '0 !important';
	},

	enable : function()
	{
		this.tempDisabled = false;
		var strip = this.getTabStrip(this.browser);
		this._window.setTimeout(function() {
			strip.collapsed = true;
			strip.hidden    = true;
		}, 0);
	},

	handleEvent : function(aEvent)
	{
		switch (aEvent.type)
		{
			case 'unload':
				return this.destroy();
		}
	}

};
