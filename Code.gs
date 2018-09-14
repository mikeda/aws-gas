var AWS = libAWS.AWS;

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('New Menu')
    .addItem('Update EC2 Sheet', 'updateEC2Sheet')
    .addToUi();
}

function updateEC2Sheet(){
  var ec2Sheet = new EC2Sheet();
  ec2Sheet.update();
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
  this.sheet = SpreadsheetApp.getActive().getSheetByName('ec2');
};

EC2Sheet.columnNames = ['clusterName', 'bappId', 'instanceId', 'state', 'instanceType', 'subnetId', 'imageId', 'pace_env'];
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
        clusterName: values[i][EC2Sheet.columnIndex.clusterName],
        bappid: values[i][EC2Sheet.columnIndex.bappId],
        instanceType: instanceType,
        imageId:  values[i][EC2Sheet.columnIndex.imageId],
        pace_env:  values[i][EC2Sheet.columnIndex.pace_env],
        subnetId: values[i][EC2Sheet.columnIndex.subnetId]
      };
      instances.push(instance);
    }
  }
  if(instances.length == 0) return;
  var description = instances.map(function(i){
    return [i.clusterName, i.bappId, i.instanceType, i.imageId, i.pace_env, i.subnetId].join(", ");
  }).join("\n");
  
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
      var clusterName = '';
      var bappId = '';
      var pace_env = '';
      if(instance.tagSet){
        for(var j=0;j<instance.tagSet.length;j++){
          if(instance.tagSet[j].key == 'ecs_cluster_name'){
            clusterName = instance.tagSet[j].value;
            //break;
          };
          if(instance.tagSet[j].key == 'bapp_id'){
            bappId = instance.tagSet[j].value;
            //break;
          };
          if(instance.tagSet[j].key == 'pace_env'){
            pace_env = instance.tagSet[j].value;
            //break;
          };
        }
        }
      var columns = [
        clusterName,
        bappId,
        instance.instanceId,
        instance.instanceState.name,
        instance.instanceType,
        instance.subnetId,
        instance.imageId,
        pace_env
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
