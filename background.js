var creds = {
	jid: 'demo@box/chrome',
	pw: 'demo',
	url: 'http://www.mobilesynergies.org/http-bind'
};

creds = {
	jid: 'admin@vmware/chrome',
	pw: 'admin',
	url: 'http://localhost:81/xmpp-httpbind'
};

var p = jQuery('<div/>').xmpp(creds);
p.xmpp('connect');

