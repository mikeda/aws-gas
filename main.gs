/**
 * sample
 */

/*
AWS_ACCESS_KEY_ID = '<AWS_ACCESS_KEY_ID>';
AWS_SECRET_ACCESS_KEY = '<AWS_SECRET_ACCESS_KEY>';
AWS_REGION = 'ap-northeast-1';
SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/XXXXXXXXXXXXXXXXXXXXX/edit';

ALERT_MAIL_TO = '<YOUR MAIL ADDRESS>';
CPU_CRITICAL = 50; // percent
*/

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('AWS')
    .addItem('AWS -> SS', 'updateEC2Sheet')
    .addItem('SS -> AWS', 'syncEC2Sheet')
    .addItem('Monitoring', 'updateMonitoring')
    .addToUi();
}

function updateEC2Sheet(){
  var ec2Sheet = new EC2Sheet();
  ec2Sheet.update();
}

function syncEC2Sheet(){
  var ec2Sheet = new EC2Sheet();
  ec2Sheet.sync();
}

function setAwsConfig(){
  AWS.config({
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
    region: AWS_REGION
  });
}

var EC2Sheet = function(){
  setAwsConfig();
  this.ec2 = new AWS.EC2();
  this.sheet = SpreadsheetApp.openByUrl(SPREADSHEET_URL).getSheetByName('ec2');
};

EC2Sheet.columnNames = ['name', 'instanceId', 'state', 'instanceType', 'subnetId', 'imageId', 'keyName'];
EC2Sheet.columnIndex = {};
for(var i=0;i<EC2Sheet.columnNames.length;i++){
  EC2Sheet.columnIndex[EC2Sheet.columnNames[i]] = i;
}

EC2Sheet.prototype.sync = function (){  
  var instances = [];
  var scan_rows = 30;
  var values = this.sheet.getRange(2, 1, scan_rows, EC2Sheet.columnNames.length + 1).getValues();
  for(var i=0;i<values.length;i++){
    var instanceId = values[i][EC2Sheet.columnIndex.instanceId];
    var instanceType = values[i][EC2Sheet.columnIndex.instanceType];
    if(instanceId === '' && instanceType !== ''){
      var instance = {
        name: values[i][EC2Sheet.columnIndex.name],
        instanceType: instanceType,
        imageId:  values[i][EC2Sheet.columnIndex.imageId],
        keyName:  values[i][EC2Sheet.columnIndex.keyName],
        subnetId: values[i][EC2Sheet.columnIndex.subnetId]
      };
      instances.push(instance);
    }
  }
  if(instances.length == 0) return;
  var description = instances.map(function(i){
    return [i.name, i.instanceType, i.imageId, i.keyName, i.subnetId].join(", ");
  }).join("\n");
  
  var ui = SpreadsheetApp.getUi();
  var result = ui.alert(
    'run instances',
    description,
    ui.ButtonSet.YES_NO
  );
  if (result == ui.Button.YES) {
    for(var i=0;i<instances.length;i++){
      var params = {
        InstanceType: instances[i].instanceType,
        ImageId:  instances[i].imageId,
        KeyName:  instances[i].keyName,
        SubnetId: instances[i].subnetId,
        MaxCount: 1,
        MinCount: 1
      };
      var self = this;
      this.ec2.runInstances(params, function (err, data) {
        var createdInstance = data.instancesSet[0];
        var instanceId = createdInstance.instanceId;
        var status = createdInstance.instanceState.name;
        var tag_params =       {
          'ResourceId': [instanceId],
          'Tag': [ 
            {'Key': 'Name', 'Value': instances[i].name}
          ]
          
        };
        self.ec2.createTags(tag_params,function (tag_err, tag_data) {});
      }); 
    }
    this.update();
  }
}

EC2Sheet.prototype.update = function() {
  var params = {
//    Filter: [
//      { Name: 'instance-state-name', Value: ['running', 'stopped'] }
//    ]
  };
  var self = this;
  this.ec2.describeInstances(params, function (err, data) {
    if (err){
      Logger.log(err);
      return;
    }
    var rows = [];
    for(var i=0;i<data.reservationSet.length;i++){
      var instance = data.reservationSet[i].instancesSet[0];
      var name = '';
      if(instance.tagSet){
        for(var j=0;j<instance.tagSet.length;j++){
          if(instance.tagSet[j].key == 'Name'){
            name = instance.tagSet[j].value;
            break;
          };
      }}
      var columns = [
        name,
        instance.instanceId,
        instance.instanceState.name,
        instance.instanceType,
        instance.subnetId,
        instance.imageId,
        instance.keyName
      ];
      rows.push(columns);
    }
    rows = rows.sort(function(a,b){return a[0] > b[0] ? 1 : -1});
    rows.unshift(EC2Sheet.columnNames);
    
    self.sheet.clear();
    self.sheet.getRange(1, 1, rows.length, EC2Sheet.columnNames.length).setValues(rows);
  });
};

function findObjectArray(arr, key, value){
  if(!arr) return undefined;
  for(var i=0;i<arr.length;i++){
    if(arr[i][key] == value) return arr[i];
  }
}

function updateMonitoring(){
  setAwsConfig();
  var ec2 = new AWS.EC2();
  var params = {
    Filter: [
      { Name: 'instance-state-name', Value: ['running'] }
    ]
  };
  ec2.describeInstances(params, function (err, data) {
    if(err) return;
    
    var reservationSet = data.reservationSet;
    for(var i=0;i<reservationSet.length;i++){
      var instance = reservationSet[i].instancesSet[0];
      var cloudwatch = new AWS.CloudWatch();
      var now = Date.now();
      var endTime = new Date(now).toISOString();
      var startTime = new Date(now - 24*60*60*1000).toISOString();
      var params = {
        'Statistics.member.1': 'Maximum',
        'StartTime': startTime,
        'EndTime': endTime,
        'Namespace': 'AWS/EC2',
        'Dimensions.member.1.Name': 'InstanceId',
        'Dimensions.member.1.Value': instance.instanceId,
        'Period': 300,
        'MetricName': 'CPUUtilization',
        'Unit': 'Percent'
      };
      
      cloudwatch.getMetricStatistics(params, function (err,data){
        if (err) return;
        var metrics = [['時間', 'CPU使用率']];
        data.GetMetricStatisticsResult.Datapoints.sort(function(a,b){
          if ( a.Timestamp < b.Timestamp ) return -1;
          if ( a.Timestamp > b.Timestamp ) return 1;
          return 0;
        }).forEach(function(datapoint){
          var year = parseInt(datapoint.Timestamp.substr(0,4), 10);
          var month = parseInt(datapoint.Timestamp.substr(5,2), 10);
          var day = parseInt(datapoint.Timestamp.substr(8,2), 10);
          var hour = parseInt(datapoint.Timestamp.substr(11,2), 10);
          var minute = parseInt(datapoint.Timestamp.substr(14,2), 10);
          var date = new Date(Date.UTC(year, month -1, day, hour, minute));
          metrics.push([date, datapoint.Maximum]);
        });
        var sheet = getOrCreateMonitoringSheet(instance.instanceId);
        sheet.getRange(1, 1, 289, 2).clear();
        sheet.getRange(1, 1, metrics.length, 2).setValues(metrics);
        
        var cpu_util = metrics[metrics.length - 1][1];
        if(cpu_util > CPU_CRITICAL){
          MailApp.sendEmail({
            to: ALERT_MAIL_TO,
            subject: 'Alert from GAS', 
            body: instance.instanceId + ' CPU Utilization : ' + cpu_util + '%'
          });
        }
      });
    }
  });
}

function getOrCreateMonitoringSheet(name){
  var sheets = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
  var sheet = sheets.getSheetByName(name);
  if(!sheet){
    sheet = sheets.insertSheet(name, sheets.getNumSheets());
    var chartBuilder = sheet.newChart();
    chartBuilder.addRange(sheet.getRange(1, 1, 289, 2))
      .setChartType(Charts.ChartType.LINE)
      .setPosition(1,3,0,0)
      .setOption('title', 'CPU使用率');
    sheet.insertChart(chartBuilder.build());
    sheet.getRange(1, 1, 289, 1).setNumberFormat("MM/DD hh:mm");
  }
  
  return sheet;
}
