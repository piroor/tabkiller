import('lib/WindowManager');
import('tabkiller');

const TYPE_BROWSER = 'navigator:browser';

function handleWindow(aWindow)
{
	if (aWindow.document.documentElement.getAttribute('windowtype') == TYPE_BROWSER &&
		!aWindow.tabKiller)
		aWindow.tabKiller = new TabKiller(aWindow);
}

WindowManager.getWindows(TYPE_BROWSER).forEach(handleWindow);
WindowManager.addHandler(handleWindow);

function shutdown()
{
	WindowManager.getWindows(TYPE_BROWSER).forEach(function(aWindow) {
		if (aWindow.tabKiller) {
			aWindow.tabKiller.destroy();
			delete aWindow.tabKiller;
		}
	});

	WindowManager = void(0);
	TabKiller = void(0);
}

function install()
{
	const Prefs = Cc['@mozilla.org/preferences;1']
					.getService(Ci.nsIPrefBranch);
	Prefs.setIntPref('extensions.tabkiller.tabs.open.behavior', -1);
	Prefs.setIntPref('extensions.tabkiller.tabs.close.behavior', -1);
}

function uninstall()
{
	const Prefs = Cc['@mozilla.org/preferences;1']
					.getService(Ci.nsIPrefBranch);
	Prefs.clearUserPref('extensions.tabkiller.tabs.open.behavior');
	Prefs.clearUserPref('extensions.tabkiller.tabs.close.behavior');
}
