/*
 * basic AWS client library for Google Apps Script
 */

var AWS = {
  _config: {},
  config: function(config) {
    if(config) this._config = config;
    return this._config;
  }
};

AWS.services = {
  EC2: {
    actions: [
      'DescribeRegions',
      'DescribeInstances',
      'DescribeImages',
      'RunInstances',
      'CreateTags'
    ],
    apiVersion: '2015-04-15',
    endpointPrefix: 'ec2'
  },
  CloudWatch: {
    actions: [
      'DescribeAlarms',
      'GetMetricStatistics'
    ],
    apiVersion: '2010-08-01',
    endpointPrefix: 'monitoring'
  }
};

AWS.Service = function(){};

AWS.Service.prototype.callApi = function(service, action, params, callback){
  var config = AWS.config();
  var accessKeyId = config.accessKeyId;
  var secretAccessKey = config.secretAccessKey;
  var region = config.region;
  var method = 'GET';
  params.Action = action;
  params.Version = service.apiVersion;
  var path = '?' + this.buildQueryString(params).sort().join('&');
  var host = service.endpointPrefix + '.' + region + '.amazonaws.com';
  var url = 'https://' + host + path;
  
  var sign = new AWSSign({
    accessKeyId: accessKeyId,
    secretAccessKey: secretAccessKey,
    region: region,
    body: '',
    host: host,
    method: method,
    url: url,
    serviceName: service.endpointPrefix
  });
  var headers = sign.toHeaders();
  var http_params = {
    method: method,
    payload: "",
    headers: headers,
    muteHttpExceptions: true
  }
  Logger.log(url);
  Logger.log(http_params);
  var response = UrlFetchApp.fetch(url, http_params);
  var xml = response.getContentText();
  var json = this.xmlToJson(xml);   
  
  callback(null, json); // TODO: error handling
};

AWS.Service.prototype.xmlToJson = function(xml){
  var doc = XmlService.parse(xml);
  var result = {};
  var root = doc.getRootElement();
  result = this.elementToJson(root);
  return result;
};

AWS.Service.prototype.elementToJson = function(element){
  var result = null;
  var self = this;
  element.getChildren().forEach(function(child) {
    var key = child.getName();
    if(result === null){
      result = (key == 'item' || key == 'member') ? [] : {};
    }
    var value = self.elementToJson(child);
    if (result instanceof Array) {
      result.push(value);
    } else {
      result[key] = value;
    }
  });
  var text = element.getText();
  if (text) {
    text = text.trim();
    if(text !== '') result = text;
  }
  return result;
};

AWS.Service.prototype.buildQueryString = function (params, result, keyString) {
  if(typeof result === 'undefined') result = [];
  var suffix = (typeof keyString === 'undefined') ? '' : keyString + '.';
  if(params instanceof Array){
    for(var i=0;i<params.length;i++){
      this.buildQueryString(params[i], result, suffix + (i+1));
    }   
  }else if(params instanceof Object){
    var self = this;
    Object.keys(params).forEach(function (key) {
      self.buildQueryString(params[key], result, suffix + key);
    }); 
  }else{
    result.push(encodeURIComponent(keyString) + '=' + encodeURIComponent(params));
  }
  
  return result;
}

Object.keys(AWS.services).forEach(function(name){
  AWS[name] = function(){};
  AWS[name].prototype = new AWS.Service();
  var service = AWS.services[name];
  for(var i=0;i<service.actions.length;i++){
    var action = service.actions[i];
    var method = action.charAt(0).toLowerCase() + action.slice(1);
    AWS[name].prototype[method] = (function(service, action){
      return function(params, callback){
        this.callApi(service, action, params, callback);
      };
    })(service, action);
  }
});
