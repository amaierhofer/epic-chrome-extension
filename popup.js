var bgPage = chrome.extension.getBackgroundPage(), p = bgPage.p;

$(function() {

	console.log('popup script running');
	var state = p.xmpp('state');
	console.log (JSON.stringify(state));
	$("#state").tmpl(state).appendTo('body');

});

