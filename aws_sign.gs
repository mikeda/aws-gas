/*
 * create AWS signature v4
 *
 * http://docs.aws.amazon.com/general/latest/gr/sigv4-signed-request-examples.html
 *
 */

var AWSSign = function (config) {
  this.accessKeyId = config.accessKeyId;
  this.secretAccessKey = config.secretAccessKey;
  this.region = config.region;
  this.serviceName = config.serviceName;
  
  this.url = config.url;
  this.url_components = this._parseURL(this.url);
  this.body = config.body;
  this.host = config.host,
  this.method = config.method;
};

AWSSign.prototype.toHeaders = function () {
  var date = new Date();
  var amzdate = date.toISOString().replace(/[:\-]|\.\d{3}/g, '');
  var datestamp = date.toISOString().replace(/-|T.*/g, '');
  
  var canonicalHeaders = 'host:' + this.host +"\n"+ 'x-amz-date:' + amzdate +"\n";
  var signedHeaders = 'host;x-amz-date';
  
  var payloadHash = this._hexdigest(this.body);
  
  var canonicalRequest = [
    this.method,
    this.url_components.path,
    this.url_components.search || '',
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");
  
  var algorithm = 'AWS4-HMAC-SHA256';
  var credentialScope = [datestamp, this.region,this.serviceName, 'aws4_request'].join('/');
  var stringToSign = [
    algorithm,
    amzdate,
    credentialScope,
    this._hexdigest(canonicalRequest)
  ].join('\n');
  
  var signingKey = this._getSignatureKey(datestamp);
  var signature = CryptoJS.HmacSHA256(stringToSign, signingKey).toString(CryptoJS.enc.Hex);
  var authorizationHeader = algorithm + ' ' + [
    'Credential=' + this.accessKeyId + '/' + credentialScope,
    'SignedHeaders=' + signedHeaders,
    'Signature=' + signature].join(', ');
  return {'x-amz-date': amzdate, 'Authorization': authorizationHeader};
};

AWSSign.prototype._getSignatureKey = function (datestamp) {
  var kDate = CryptoJS.HmacSHA256(datestamp, 'AWS4' + this.secretAccessKey);
  var kRegion = CryptoJS.HmacSHA256(this.region, kDate);
  var kService = CryptoJS.HmacSHA256(this.serviceName, kRegion);
  var kSigning = CryptoJS.HmacSHA256('aws4_request', kService);
  return kSigning;
};

AWSSign.prototype._hexdigest = function (key) {
  return CryptoJS.SHA256(key).toString(CryptoJS.enc.Hex);
};

AWSSign.prototype._parseURL = function(url) {
  var regexp = /^(https?):\/\/([^?\/]+)(\/.+)?\?(.+)$/;
  var m = url.match(regexp);
  // TODO: error handling
  var path = m[3] || '/';
  return {protocol: m[1], host: m[2], path: path, search: m[4]};
}
