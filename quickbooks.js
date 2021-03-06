var OAuth=require('oauth').OAuth;
var Client = require('node-rest-client').Client;
var async = require('async');
var client = new Client();

var emitter = require('../core-integration-server-v2/javascripts/emitter');

var consumerKey, consumerSecret, accessToken, tokenSecret, accountType, companyId, url,
incomeAccNo, incomeAccName, expenseAccNo, expenseAccName, assetAccNo, assetAccName, actionName;
var errMsg = '"Connection timeout error" in Quickbooks online';

function run(node) {
	try {
		var requestUrl = "https://oauth.intuit.com/oauth/v1/get_request_token";
		var authorizeUrl = "https://appcenter.intuit.com/Connect/Begin";
		var type = node.option.toLowerCase();
		var nodeType = node.connector.type;
		actionName = node.connection.actionName.toLowerCase();
		if(accountType.toLowerCase() == "sandbox") {
			url = "https://sandbox-quickbooks.api.intuit.com/v3/company/";
		} else {
			url = "https://quickbooks.api.intuit.com/v3/company/";
		}
		oauth= new OAuth(requestUrl, authorizeUrl, consumerKey, consumerSecret, "1.0", null,
			"HMAC-SHA1", null, {Accept : "application/json"} );
		if(nodeType.toLowerCase() == "trigger") {
			getStoreData(url, type, oauth, node);
		} else {
			postObjects(url, type, oauth, node);
		}
	} catch(e) {
		emitter.emit('error', e.message, e.stack, "", node);
	}
}

function getStoreData(url, type, oauth, node) {
	try {
		var query;
		if(type == "customer") {
			query = "select * from customer";
		} else if(type == "salesreceipt") {
			query = "select * from salesreceipt";
		} else if(type == "invoice") {
			query = "select * from invoice";
		} else {
			query = "select * from item";
		}
		url += companyId + "/query?query=" + encodeURIComponent(query);
		oauth.get(url,accessToken,tokenSecret,function(err,data,res) {
			try {
				if(err) {
					emitter.emit("error", errMsg, "", url, node);
				} else {
					formDataModel(data, type, node);
				}
			} catch(e) {
				emitter.emit('error', e.message, e.stack, "", node);
			}
		});
	} catch(e) {
		emitter.emit('error', e.message, e.stack, "", node);
	}
}

function formDataModel(data, type, node) {
	try {
		var res = JSON.parse(data);
		var dataArr = [];
		if(type == "customer") {
			dataArr = res.QueryResponse.Customer;
			formCustomer(dataArr, node);
		} else if(type == "salesreceipt") {
			dataArr = res.QueryResponse.SalesReceipt;
			formOrder(dataArr, node);
		} else if(type == "invoice") {
			dataArr = res.QueryResponse.Invoice;
			formOrder(dataArr, node);
		} else {
			dataArr = res.QueryResponse.Item;
			formProduct(dataArr,node);
		}
	} catch(e) {
		emitter.emit('error', e.message, e.stack, "", node);
	}
}

function formCustomer(dataArr, node) {
	try {
		var resArr = [];
		var obj,resObj;
		var msgPrefix = 'No ';
		if(node.optionType.toLowerCase() == 'new') {
			msgPrefix = 'No new ';
		}
		var lastName = phone = company = street = city = state = country = '';
		if(dataArr.length == 0) {
			errMsg = msgPrefix + 'customers found in Quickbooks';
			emitter.emit('error', errMsg, "","", node);
			return;
		} 
		for(var i = 0; i < dataArr.length; i++) {
			resObj = {};
			obj = dataArr[i];
			if(obj.hasOwnProperty("MiddleName")) {
				lastName = obj.MiddleName;
			}
			resObj.name = obj.FullyQualifiedName;
			resObj.firstName = obj.GivenName;
			resObj.lastName = lastName;
			resObj.createdAt = obj.MetaData[0];
			resObj.updatedAt = obj.MetaData[1];
			resObj.email = obj.PrimaryEmailAddr.Address;
			var addr1 = {};
			addr1.firstName = obj.GivenName;
			addr1.lastName = lastName;
			if(obj.hasOwnProperty("BillAddr")) {
				street = obj.BillAddr.Line1;
				city = obj.BillAddr.City;
				country = obj.BillAddr.Country;
				state = obj.BillAddr.CountrySubDivisionCode;
				zip = obj.BillAddr.PostalCode;
			}
			addr1.street = street;
			addr1.city = city;
			addr1.country = country;
			addr1.state = state;
			addr1.zip = zip;
			if(obj.hasOwnProperty("PrimaryPhone")) {
				phone = obj.PrimaryPhone.FreeFormNumber;
			}
			addr1.phone = phone;
			if(obj.hasOwnProperty("CompanyName")) {
				company = obj.CompanyName;
			}
			addr1.company = company;
			resObj.defaultAddress = addr1;
			resObj.slackFlag = false;
			if(actionName == 'slack' && i == 0) {
				resObj.slackFlag = true;
			}
			resObj.isLast = false;
			if(i == dataArr.length-1) {
				resObj.isLast = true;
			}
			resArr[i] = resObj;
		}
		post(resArr, node,"");
	} catch(e) {
		emitter.emit('error', e.message, e.stack, "", node);
	}
}

function formProduct(dataArr, node) {
	try {
		var resArr = [];
		var obj,resObj;
		var sku = '';
		var qtyOnHand = '';
		var msgPrefix = 'No '
		if(node.optionType.toLowerCase() == 'new') {
			msgPrefix = 'No new ';
		}
		if(dataArr.length == 0) {
			errMsg = msgPrefix + 'products found in Quickbooks';
			emitter.emit('error', errMsg, "","", node);
			return;
		} 
		for(var i = 0; i < dataArr.length; i++) {
			resObj = {};
			obj = dataArr[i];
			resObj.id = obj.Id;
			resObj.name = obj.Name;
			resObj.price = obj.UnitPrice;
			resObj.createdAt = obj.MetaData[0];
			resObj.updatedAt = obj.MetaData[1];
			if(obj.hasOwnProperty("Sku")){
				sku = obj.Sku;
			}
			resObj.sku = sku;
			if(obj.hasOwnProperty("QtyOnHand")) { 
				qtyOnHand = obj.QtyOnHand;
			}
			resObj.qtyOnHand = qtyOnHand;
			resObj.slackFlag = false;
			if(actionName == 'slack' && i == 0) {
				resObj.slackFlag = true;
			}
			resObj.isLast = false;
			if(i == dataArr.length-1) {
				resObj.isLast = true;
			}
			resArr[i] = resObj;
		}
		post(resArr, node);
	} catch(e) {
		emitter.emit('error', e.message, e.stack, "", node);
	}
}

function formOrder(dataArr, node) {
	try {
		var resArr = [];
		var obj,resObj;
		var email = '';
		var msgPrefix = 'No '
		if(node.optionType.toLowerCase() == 'new') {
			msgPrefix = 'No new ';
		}
		if(dataArr.length == 0) {
			errMsg = msgPrefix + 'orders found in Quickbooks';
			emitter.emit('error', errMsg, "", "", node);
			return;
		}
		for(var i = 0; i < dataArr.length; i++) {
			resObj = {};
			obj = dataArr[i];
			resObj.id = obj.Id;
			resObj.name = obj.DocNumber;
			if(obj.hasOwnProperty("BillEmail")) {
				email = obj.BillEmail.Address
			}
			resObj.email = email;
			resObj.price = obj.TotalAmt;
			resObj.createdAt = obj.MetaData[0];
			resObj.updatedAt = obj.MetaData[1];
			resObj.customerId = obj.CustomerRef.value;
			resObj.customerName = obj.CustomerRef.name;
			var billAddr = {};
			billAddr.name = obj.CustomerRef.name;
			billAddr.street = obj.BillAddr.Line1;
			billAddr.city = obj.BillAddr.City;
			billAddr.state = obj.BillAddr.CountrySubDivisionCode;
			billAddr.country = obj.BillAddr.Country;
			billAddr.zip = obj.BillAddr.PostalCode;
			resObj.billingAddress = billAddr;
			var shipAddr = {};
			shipAddr.name = obj.CustomerRef.name;
			shipAddr.street = obj.ShipAddr.Line1;
			shipAddr.city = obj.ShipAddr.City;
			shipAddr.state = obj.ShipAddr.CountrySubDivisionCode;
			shipAddr.country = obj.ShipAddr.Country;
			shipAddr.zip = obj.ShipAddr.PostalCode;
			resObj.shippingAddress = shipAddr;
			var prod,item;
			var itemArr = [];
			var prodArr = obj.Line;
			var quantity = '';
			for(var j = 0; j < prodArr.length-1; j++) {
				item = {};
				prod = prodArr[j];
				var itemDetail = prod.SalesItemLineDetail; 
				var qty = itemDetail.Qty;
				item.id = itemDetail.ItemRef.value;
				item.name = itemDetail.ItemRef.name;
				quantity += qty;
				var price = prod.Amount/qty;
				item.price = price;
				itemArr[j] = item;
			}
			resObj.items = itemArr;
			resObj.quantity = quantity;
			var balance = obj.Balance;
			var status = "pending";
			if(balance == 0) {
				status = "paid";
			}
			resObj.status = status;
			resObj.slackFlag = false;
			if(actionName == 'slack' && i == 0) {
				resObj.slackFlag = true;
			}
			resObj.isLast = false;
			if(i == dataArr.length-1) {
				resObj.isLast = true;
			}
			resArr[i] = resObj;
		}
		post(resArr, node);
	} catch(e) {
		emitter.emit('error', e.message, e.stack, "", node);
	}
}

function postObjects(url, type, oauth, node) {
	try {
		if(type == "customer") {
			postCustomer(url, oauth, node);
		} else if(type == "product") {
			postProduct(url, oauth, node);
		} else {
			getProductDetails(url, type, oauth, node);
		}
	} catch(e) {
		emitter.emit('error', e.message, e.stack, "", node);
	}
}

function postCustomer(url,  oauth, node, callback) {
	try {
		url += companyId + "/customer";
		var obj = node.reqData;
		var name, street, city, country, state, zip, phone;	
		if(obj.hasOwnProperty('shippingAddress')) {
			name = obj.billingAddress.name;
			street = obj.billingAddress.street;
			city = obj.billingAddress.city;
			state = obj.billingAddress.state;
			phone = obj.billingAddress.phone;
			zip = obj.billingAddress.zip;
		} else {
			name = obj.firstName;
			street = obj.defaultAddress.street;
			city = obj.defaultAddress.city;
			state = obj.defaultAddress.state;
			phone = obj.defaultAddress.phone;
			zip = obj.defaultAddress.zip;
		}
		var postData = {
			DisplayName : name,
			PrimaryEmailAddr : { Address : obj.email },
			PrimaryPhone : { FreeFormNumber : phone },
			BillAddr : { Line1 : street,
				City : city,
				Country : country,
				CountrySubDivisionCode : state,
				PostalCode : zip 
			}
		};
		var Params = oauth._prepareParameters(accessToken,tokenSecret,"POST",url);
		var auth = oauth._buildAuthorizationHeaders(Params);
		var args = {
			data:postData,
			headers : {Authorization: auth,Accept: "application/json","Content-Type":"application/json"}
		};
		setTimeout(function() {
			client.post(url, args, function (data, res) {
				try {
					var status = parseInt(res.statusCode/100);
					if(status == 2){
						if( typeof callback == 'undefined') {
							var msg = 'Customer for ' + obj.email + ' created successfully in Quickbooks';
							post(data, node, msg);
						} else {
							var customer = data.Customer;
							var customerRef = {};
							customerRef.value = customer.Id;
							customerRef.name = customer.DisplayName;
							callback(customerRef);
						}
					} else {
						if(data.hasOwnProperty('Fault')) {
							if(data.Fault.hasOwnProperty('Error')) {
								var error = data.Fault.Error[0];
								if(error.hasOwnProperty('Message')) {
									errMsg = error.Message;
									if(error.hasOwnProperty('Detail')) {
										errMsg += error.Detail;
									}
								}
							}
						}
						emitter.emit('error', errMsg, data, url, node);
					}
				} catch(e) {
					emitter.emit('error', e.message, e.stack, "", node);
				}          
			}).on('error',function(err) {
				emitter.emit('error', errMsg, errMsg, url, node);
			});
		}, 8000);
	} catch(e) {
		emitter.emit('error', e.message, e.stack, "", node);
	}
}	

function postProduct(url, oauth, node, item, callback) {
	try {
		url += companyId + "/item";
		var quantity;
		var obj = item;
		if(typeof callback == 'undefined') {
			obj = node.reqData;
		} 
		if(obj.hasOwnProperty('qtyOnHand') && obj.qtyOnHand != 0) {
			quantity = obj.qtyOnHand;
		} else {
			quantity = obj.quantity;
		}
		var postData = {
			Name: obj.name,
			UnitPrice: obj.price,
			Sku: obj.sku,
			IncomeAccountRef: {value: incomeAccNo, name:incomeAccName },
			ExpenseAccountRef: {value: expenseAccNo , name: expenseAccName },
			AssetAccountRef: {value: assetAccNo,name: assetAccName},
			Type: "Inventory",
			TrackQtyOnHand: true,
			QtyOnHand: quantity,
			InvStartDate: new Date()
		};
		var Params = oauth._prepareParameters(accessToken,tokenSecret,"POST",url);
		var auth = oauth._buildAuthorizationHeaders(Params);
		var args = {
			data:postData,
			headers : {Authorization: auth,Accept: "application/json","Content-Type":"application/json"}
		};
		setTimeout(function(){
			client.post(url, args, function (data, res) {
				try {
					var status = parseInt(res.statusCode/100);
					if(status == 2){
						if( typeof callback == 'undefined') {
							var msg = 'Product ' + obj.name + ' created successfully in Quickbooks';
							post(data, node, msg);
						} else {
							var product = data.QueryResponse.Item[0];
							callback(product.Id);
						}
					} else {
						if(data.hasOwnProperty('Fault')) {
							if(data.Fault.hasOwnProperty('Error')) {
								var error = data.Fault.Error[0];
								if(error.hasOwnProperty('Message')) {
									errMsg = error.Message;
									if(error.hasOwnProperty('Detail')) {
										errMsg += error.Detail;
									}
								}
							}
						}
						emitter.emit('error', errMsg, data, url, node);
					}
				} catch(e) {
					emitter.emit('error', e.message, e.stack, "", node);
				}
			}).on('error',function(err) {
				emiitter.emit("error", errMsg, args.data, url, node);
			});
		}, 8000);
	} catch(e) {
		emitter.emit('error',e.message, e.stack, "", node);
	}
}

function getProductDetails(url, type, oauth, node) {
	try {
		var obj = node.reqData;
		var items = obj.items;
		var length = items.length;
		async.forEach(items, function(item) {
			getItemId(url, oauth, item, node, function(id) {
				item.id = id;
				length--;
				if(length == 0) {
					postInvoiceOrSalesReceipt(url, type, oauth, node);
				}
			});
		});
	} catch(e) {
		emitter.emit('error', e.message, e.stack, '', node);
	}
}

function postInvoiceOrSalesReceipt(url, type, oauth, node) {
	try {
		var lineArr = [];
		var str = type.replace(/\s/g,'').toLowerCase();
		var newUrl = url + companyId + "/" + str.toLowerCase();
		var obj = node.reqData;
		var postData, lineObj;
		var items = obj.items;
		var msgType = type.charAt(0).toUpperCase() + type.substring(1);
		getCustomerId(url, oauth, node, function(cusRef) {
			for(var j = 0; j < items.length; j++) {
				lineObj = {};
				var item = items[j];
				lineObj.Amount =  (item.price * item.quantity );
				lineObj.DetailType = "SalesItemLineDetail";
				var salesILD = {};
				var	itemRef = {};
				itemRef.value =item.id;
				itemRef.name = item.name;
				salesILD.ItemRef = itemRef;
				salesILD.Qty = item.quantity;
				lineObj.SalesItemLineDetail = salesILD;
				lineArr[j] = lineObj;
			}
			postData = { Line: lineArr,CustomerRef: cusRef};
			var Params = oauth._prepareParameters(accessToken,tokenSecret,"POST",newUrl);
			var auth = oauth._buildAuthorizationHeaders(Params);
			var args = {
				data: postData,
				headers : {Authorization: auth,Accept: "application/json","Content-Type":"application/json"}
			};
			setTimeout(function() {
				client.post(newUrl, args, function (data, res) {
					try {
						var status = parseInt(res.statusCode/100);
						if(status == 2){
							var docNo;
							if(data.hasOwnProperty('SalesReceipt')) {
								docNo = data.SalesReceipt.DocNumber;
							} else {
								docNo = data.Invoice.DocNumber;
							}
							var msg = msgType + ' for the order with the id ' + obj.id + 
							' created successfully in Quickbooks with the number ' + docNo;
							post(data, node, msg);
						} else {
							if(data.hasOwnProperty('Fault')) {
								if(data.Fault.hasOwnProperty('Error')) {
									var error = data.Fault.Error[0];
									if(error.hasOwnProperty('Message')) {
										errMsg = error.Message;
										if(error.hasOwnProperty('Detail')) {
											errMsg += error.Detail;
										}
									}
								}
							}
							emitter.emit('error', errMsg, data, newUrl, node);
						}
					} catch(e) {
						emitter.emit('error', e.message, e.stack, "", node);
					}
				}).on('error',function(err) {
					emitter.emit('error', errMsg, args.data, newUrl, node);
				});	
			}, 8000);
		});	
	} catch(e) {
		emitter.emit('error',e.message, e.stack, "", node);
	}
}

function getCustomerId(url, oauth, node, callback) {
	try {
		var obj = node.reqData;
		var customerRef = {};
		var query = "select * from customer where DisplayName in ('" + obj.billingAddress.name +"')";
		var newUrl = url + companyId + "/query?query=" + encodeURIComponent(query);
		setTimeout(function() {
			oauth.get(newUrl, accessToken, tokenSecret, function(err, data, res) {
				try {
					if(err) {
						emitter.emit('error', errMsg, "", newUrl, node);
					} else {
						var result = JSON.parse(data);
						var queryRes = result.QueryResponse;
						if( queryRes.hasOwnProperty("Customer")) {
							var customer = result.QueryResponse.Customer[0];
							customerRef.value = customer.Id;
							customerRef.name = customer.DisplayName;
							callback(customerRef);
						} else {
							postCustomer(url, oauth, node, function(ref) {
								callback(ref);
							});	
						}
					}
				} catch(e) {
					emitter.emit('error', e.message, e.stack, "", node);
				}
			});
		}, 8000);
	} catch(e) {
		emitter.emit('error', e.message, e.stack, "", node);
	}
}

function getItemId(url, oauth, item, node, callback) {
	try {
		var query = "select * from item where Name in ('" + item.name + "')";
		var newUrl = url + companyId + "/query?query= " + encodeURIComponent(query);
		setTimeout(function() {
			oauth.get(newUrl, accessToken, tokenSecret, function(err, data, res) {
				try {
					if(err) {
						emitter.emit('error',err, "", newUrl, node);
					} else {
						var result = JSON.parse(data);
						var queryRes = result.QueryResponse;
						if(queryRes.hasOwnProperty("Item")) {
							var product = result.QueryResponse.Item[0];
							id = product.Id;
							callback(id);
						} else {
							postProduct(url, oauth, node, item,function(prodId){
								id = prodId;
								callback(id);
							});
						}
					}
				} catch(e) {
					emitter.emit('error', e.message, e.stack, "", node);
				}
			});
		}, 8000);
	} catch(e) {
		emitter.emit('error', e.message, e.stack, "", node);
	}
}

function post(Response, node,message) {
	node.resData = Response;
	emitter.emit('success',node,message);
}

function testApp(callback) {
	try {
		var requestUrl = "https://oauth.intuit.com/oauth/v1/get_request_token";
		var authorizeUrl = "https://appcenter.intuit.com/Connect/Begin";
		var result;
		if(accountType.toLowerCase() == "sandbox") {
			url = "https://sandbox-quickbooks.api.intuit.com/v3/company/";
		} else {
			url = "https://quickbooks.api.intuit.com/v3/company/";
		}
		oauth = new OAuth(requestUrl, authorizeUrl, consumerKey, consumerSecret, "1.0", null,
			"HMAC-SHA1", null, { Accept : "application/json"} );
		var query = "select * from customer";
		url += companyId + "/query?query=" + encodeURIComponent(query);
		oauth.get(url,accessToken,tokenSecret,function(err,data,res) {
			try {
				if(err) {
					result = {
						status : 'error',
						response : data
					};
				} else {
					result = {
						status : 'success',
						response : data
					};
				}
				callback(result);
			} catch(e) {
				callback({status:"error", response:e.stack});
			}
		});
	} catch(e) {
		callback({status:"error", response:e.stack});
	}
}

function test(request, callback) {
	try {
		var credentials = request.credentials;
		consumerKey = credentials.consumerKey;
		consumerSecret = credentials.consumerSecret;
		accessToken = credentials.accessToken;
		tokenSecret = credentials.tokenSecret;
		accountType = credentials.accountType;
		companyId = credentials.companyId;
		testApp(callback);
	} catch(e) {
		callback({status:"error", response:e.stack});
	}
}

function init(node) {
	try {
		var credentials = node.credentials;
		consumerKey = credentials.consumerKey;
		consumerSecret = credentials.consumerSecret;
		accessToken = credentials.accessToken;
		tokenSecret = credentials.tokenSecret;
		accountType = credentials.accountType;
		companyId = credentials.companyId;
		incomeAccNo = credentials.incomeAccountId;
		incomeAccName = credentials.incomeAccountName;
		expenseAccNo = credentials.expenseAccountId;
		expenseAccName = credentials.expenseAccountName;
		assetAccNo = credentials.assetAccountId;
		assetAccName = credentials.assetAccountName;
		run(node);
	} catch(e) {
		emitter.emit('error', e.message, e.stack, "", node);
	}
}

var Quickbooks = {
	init :  init,
	test : test
};

module.exports = Quickbooks;