/* eslint-disable prefer-template */
/* eslint-disable prefer-rest-params */
/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable no-nested-ternary */
/* eslint-disable no-unexpected-multiline */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable vars-on-top */
/* eslint-disable no-var */
/* eslint-disable func-names */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

import { INTERCOMid as APPid } from "@app/components/utilities/config";

// Loads Intercom with the snippet
// This must be run before boot, it initializes window.Intercom

// prettier-ignore
export const load = () => {
  (function(){
    var w=window;
    var ic=w.Intercom;
    
    if(typeof ic==="function"){
      ic("reattach_activator");
      ic("update",w.intercomSettings);
    } else {
      var d=document;
      var i=function() {
        i.c(arguments);
      };
      i.q=[];
      i.c=function(args) {
        i.q.push(args);
      };
      w.Intercom=i;
      var l=function() {
        var s=d.createElement("script");
        s.type="text/javascript";
        s.async=true;
        s.src="https://widget.intercom.io/widget/" + APPid;
        var x=d.getElementsByTagName("script")[0];
        x.parentNode.insertBefore(s, x);
      };
      if (document.readyState==="complete") {
        l();
      } else if (w.attachEvent) {
        w.attachEvent("onload",l);
      } else {
        w.addEventListener("load",l,false);
      }
    }
  })();
}

// Initializes Intercom
export const boot = (options = {}) => {
  window && window.Intercom && window.Intercom("boot", { appid: APPid, ...options });
};

export const update = () => {
  window && window.Intercom && window.Intercom("update");
};
