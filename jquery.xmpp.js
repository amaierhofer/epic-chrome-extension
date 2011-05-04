(function($) {

  $.widget("nmk.xmpp", {
    // default options 
    options:  {
      url: 'http://localhost/xmpp-httpbind',
      jid: 'a@a/a',
      pw: 'a',
      ping: {
        interval: 60000,
        timeout: 2000
      }
    },

    //storing session keys
    _sessions : {},
    _create: function() {
      Strophe.log = function(level, msg) { console.log(level + ": " + msg); };
      Strophe.debug = function(level, msg) { };
      this.__bindListeners();
    }, 

    /**
     * Internal API
     *  - peers: object of peers we got presence from
     *  - initialized: set to true when we already tried connecting once
     **/ 
    __state: {
      peers: {},
      initialized: false,
      messages: []
    },

    // added to connection, triggers transition event on state change
    __connectionCallback: function(idx) {
      for (var st in Strophe.Status) {
        if (idx === Strophe.Status[st]) {
          this.__state.idx = idx;
          this.__state.name = st;
          this.__trigger('transition', this.__state);
          this.__trigger(st.toLowerCase(), this.__state);
          this.__log(st);
        }
      }
    },


    /**
     * Presence functionality
    */ 
    __addPresenceHandler: function() {
      this.__bind('presence', $.proxy(this.__onPresenceReceived, this));
      var presenceHandler = $.proxy(function(stanza) {
        this.__trigger('presence',Strophe.serialize(stanza));
        return true;
      }, this);
      this._connection.addHandler(presenceHandler, null, 'presence', null,
                                  null, null, null);
    },
    __onPresenceReceived: function(ev,stanza) {
      var from = $(stanza).attr('from'), type = $(stanza).attr('type') || "available";
      this.__log('onPresenceReceived: ' + from + ' => ' + type);
      if (from !== this._connection.jid) {
        this.__state.peers[from] = type;
      }
      this.__trigger('transition', this.__state);
    },
    __sendPresence: function() {
      this._connection.send($pres());
    },

    /** 
     * Messaging functionality
     */ 
    __addMessageHandler: function() {
      this.__bind('message', $.proxy(this.__onMessageReceived, this));

      var msgHandler = $.proxy(function(stanza) {
        this.__trigger('message', Strophe.serialize(stanza));
        return true;
      }, this);

      this._connection.addHandler(msgHandler, null, 'message', null,
                                  null, null, null);
    },
    __onMessageReceived: function(ev,stanza) {
      var from = $(stanza).attr('from'), type = $(stanza).attr('type') || "undefined";
      var sessionkey = jQuery(stanza).children().filter('application').attr('session');
      if(sessionkey){
        sessioncallbackfunction = this._sessions[sessionkey.trim()];
        sessioncallbackfunction(jQuery(stanza).children().filter('application'));
      }
      this.__log('onMessageReceived: ' + from + ' => ' + type);
      this.__log(stanza);
    }, 

    // adds a periodic sending handler and a response handler for pings to peer
    __addPingHandler: function() {
      var pingHandler = $.proxy(this.__sendPing, this);

      var pingResponderHandler = $.proxy(function(stanza) {
        var from = $(stanza).attr('from'), id = $(stanza).attr('id');
        var response = $iq({to: from, id: id, type: 'result'});
        this._connection.sendIQ(response);
        return true;
      }, this);

      this.__sendPing();
      setInterval(pingHandler, this.options.ping.interval);
      this._connection.addHandler(pingResponderHandler, 
                                  'urn:xmpp:ping', 'iq', null, null, null);
    },

    __log: function(msg) {
      console.log('jquery.xmpp: ' + msg);
    },

    // wrapper fn to bind to an event on the dom element
    __bind: function(event, fn) {
      var ev = 'xmpp.' + event;
      this.element.bind(ev, $.proxy(fn,this));
    },

    __trigger: function(event,stanza) {
      this._trigger('.' + event, null, stanza);
    },

    __updateElements: function(ev,state) {
      this.__log('updateElements: ' + this.element.find('.xmpp-status').size());
      this.element.find('.xmpp-status').each(function(i,e) {
        $(e).html(state.name.toLowerCase());
      });
      this.element.find('.xmpp-status-phone').each(function(i,e) {
        var peers = _.select(_.keys(state.peers), function(jid) {
          if(/strophe|android|psi/.test(jid)) { return true; }
        }), str = [];
        if (_.size(peers) === 0) { return; }
        $.nmk.log('peers: ' + peers);
        _.each(peers, function(peer) {
          //str.push(peer.split('/')[1] + " " + state.peers[peer]);
          str.push(state.peers[peer]);
        });
        if(str.length > 0) {
          $(e).html(str.join(' '));
        }
      });
      var linkHandler = this.options.linkHandler;
      
      this.element.find('.xmpp-peer-list').each(function(i,e) {
        $(e).find('.ui-radio').remove();

        $.each(state.peers, function(k,v) {
          //if (linkHandler) { k = linkHandler.call(this,k); }
	  var myid = i.toString();
          var inputfield = '<input type="radio" checked="checked" name="radio-choice-1" id="radio-choice-'+myid+'" value="choice-'+myid+'" class="' + v + '"> </input>';
	  
	  var labelfield = '<label for="radio-choice-'+myid+'">' + k + '</label>';
	  
          $(e).append(inputfield);
	  $(e).append(labelfield);

        });
	
      });
	
    },
    __bindListeners: function() {
      this.__bind('transition', this.__updateElements);
//      this.__bind('connected', this.__addPingHandler);
      this.__bind('connected', this.__addPresenceHandler);
      this.__bind('connected', this.__addMessageHandler);
    },

	__generateSessionkey: function() {
		var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";
		var string_length = 16;
		var randomstring = '';
		for (var i=0; i<string_length; i++) {
			var rnum = Math.floor(Math.random() * chars.length);
			randomstring += chars.substring(rnum,rnum+1);
		}
		return randomstring; 
	},

    /**
   * Public API
   **/ 
    connect: function() {
      var opts = this.options;
      var connectionCallback = $.proxy(this.__connectionCallback, this);

      this._connection = new Strophe.Connection(opts.url);

      this._connection.xmlInput = $.proxy(function (body) {
        this.__trigger('incoming', body);
      },this);

      this._connection.xmlOutput = $.proxy(function (body) {
        this.__trigger('outgoing', body);
      },this);

      // add /strophe resource identifier if non was specified
      if (!/\//.test(opts.jid)) {
        opts.jid += "/strophe";
      }

      this.__bind('connected', this.__sendPresence);
      this.__log('connecting to ' + opts.url);
      this.__log('connecting as ' + opts.jid + ' with ' + opts.pw);
      this._connection.connect(opts.jid, opts.pw, connectionCallback);

      this.__state.initialized = true;

    },
    disconnect: function() {
      this._connection.disconnect();
      this.__state.peer = false;
      this.__state.initialized = false;
    }, 

    send: function(text, recipient) {
	if(! recipient){
		recipient = this.options.peers;
	}
		
      var msg = $msg({to: recipient, type: 'chat'}).c('body').t(text);
      this._connection.send(msg);

    },
    getJid: function() {
		return this.options.jid;
	},

	getUsername: function() {
		theJid = this.options.jid;
		return theJid.split('@')[0];
	},

	getBareJid: function() {
		theJid = this.options.jid;
		return theJid.split('/')[0];
	},

	getPassword: function() {
		return this.options.pw;
	},

	getServer: function() {
		return this.getBareJid().split('@')[1];
	},

    state: function() {
      return this.__state;
    },
    connection: function() {
      return this._connection;
    },
    update: function() {
      this.__updateElements({}, this.__state);
    },

	sendEpicIntent : function(jid, action, data, callback){
		vsessionkey = this.__generateSessionkey();

        var msg = $msg({to: jid, type: 'chat'}).c('application', {xmlns: 'http://mobilesynergies.org/protocol/epic', action: action, session: vsessionkey});
        if(data)
            msg.cnode(data[0]);
		this._connection.send(msg);

		this.__log(msg);
		if(callback){
			this._sessions[vsessionkey]=callback;
		}
	},

    getSessions : function(){
        return this._sessions;
    }
	
  });

})(jQuery);
