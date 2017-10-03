/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *			http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// ****[ 連携しているデータベース情報 ]***
// $ mysql -u kota-p okayama_city
//
// mysql> show tables;
// +------------------------+
// | Tables_in_okayama_city |
// +------------------------+
// | answers                |
// | documents              |
// | search_results         |
// +------------------------+
// 3 rows in set (0.00 sec)
// 
// mysql> desc answers;
// +-------------+--------+------+-----+---------+-------+
// | Field       | Type   | Null | Key | Default | Extra |
// +-------------+--------+------+-----+---------+-------+
// | id          | int(6) | NO   |     | NULL    |       |
// | document_id | int(6) | YES  |     | NULL    |       |
// +-------------+--------+------+-----+---------+-------+
// 2 rows in set (0.00 sec)
// 
// mysql> desc search_results;
// +------------------+------------------+------+-----+-------------------+-----------------------------+
// | Field            | Type             | Null | Key | Default           | Extra                       |
// +------------------+------------------+------+-----+-------------------+-----------------------------+
// | id               | int(6)           | NO   |     | NULL              |                             |
// | question_body    | varchar(500)     | YES  |     | NULL              |                             |
// | answers_id       | int(6)           | YES  | MUL | NULL              |                             |
// | listening_result | enum('yes','no') | YES  |     | NULL              |                             |
// | timestamp        | timestamp        | NO   |     | CURRENT_TIMESTAMP | on update CURRENT_TIMESTAMP |
// +------------------+------------------+------+-----+-------------------+-----------------------------+
// 5 rows in set (0.00 sec)


'use strict';

// ***
// * Require modeuls
// *
var express 				= require('express');
var bodyParser			 	= require('body-parser');
var Conversation		 	= require('watson-developer-cloud/conversation/v1');
var Retrieve_and_rank		= require('watson-developer-cloud/retrieve-and-rank/v1');
var qs 						= require('qs');
var operatorDB				= require('./operateDB.js');
require('date-utils');

// ***
// * 
// *
var app = express();

// ***
// * Bootstrap application settings
// *
app.use( express.static('./public') ); 	// load UI from public folder
app.use( bodyParser.json() );

// ***
// * Create the service wrapper
// *
var conversation 		= new Conversation({
	// If unspecified here, the CONVERSATION_USERNAME and CONVERSATION_PASSWORD env properties will be checked
	// After that, the SDK will fall back to the bluemix-provided VCAP_SERVICES environment property
	// username: '<username>',
	// password: '<password>',
	//url: 'https://gateway.watsonplatform.net/conversation/api',
	version_date: '2017-02-03',
	version: 'v1'
});
var solrQuery			= null;			// query for using on fcselect
var retrieve_and_rank	= new Retrieve_and_rank( { username: process.env.RAR_USERNAME, password: process.env.RAR_PASSWORD, version: 'v1' } );
var randrParams		 	= { cluster_id: process.env.RAR_SOLR_CLUSTER_ID, collection_name: process.env.RAR_COLLECTION_NAME };
var solrClient 			= retrieve_and_rank.createSolrClient( randrParams );
var ranker_id 			= process.env.RAR_RANKERID;

// ***
// * データベース用パラメータ
// *
var date				= null;			// data-utilsインスタンス
var timestamp			= null;			// タイムスタンプ
var id					= 0;			// search_resultsのID
var documentIdList		= new Array();	// R&Rの検索結果
var questionBody		= null;			// 質問内容
var answersId			= 0;			// answersのID
var listening_result	= null;			// アンケート結果(yes / no)
var paramsName			= null;			// databaseQuery用  クエリを構成するパラメータ名の集合を示す文字列
var paramsValue			= null;			// databaseQuery用  クエリを構成するパラメータ値の集合を示す文字列
var databaseQuery		= null;			// databaseQueies用  mysqlへ投げるクエリ文字列
var databaseQueries		= new Array();	// クエリリスト

// ***
// * Endpoint to be call from the client side
// *
app.post('/api/message', function(req, res) {

	console.log( "--------------------------------------" );

	var workspace = process.env.WORKSPACE_ID || '<workspace-id>';
	if (!workspace || workspace === '<workspace-id>') {
		return res.json({
			'output': {
				'text': 'The app has not been configured with a <b>WORKSPACE_ID</b> environment variable. Please refer to the ' + '<a href="https://github.com/watson-developer-cloud/conversation-simple">README</a> documentation on how to set this variable. <br>' + 'Once a workspace has been defined the intents may be imported from ' + '<a href="https://github.com/watson-developer-cloud/conversation-simple/blob/master/training/car_workspace.json">here</a> in order to get a working application.'
			}
		});
	}
	// ***
	// * conversationリクエストの初期化
	// *
	var payload = {
		workspace_id: workspace,
		context: req.body.context || {},
		input: req.body.input || {}
	};
	console.log( "==> input text is [" + payload.input.text + "]" );

	// ***
	// * conversationサービスへユーザからの入力文字列を送信
	// * 送信してレスポンス返ってきたらコールバック関数実行される dataにレスポンスが来る
	// *
	console.log( '==> send message to conversation' )
	conversation.message(payload, function( err, conversationResponse ) {
		if (err) {
			return res.status(err.code || 500).json(err);
		}
		console.log( '  -- SUCCESS : send message\n' );

		// ***
		// * conversationレスポンスをアップデート
		// * 
		if ( !conversationResponse.output ) {
			conversationResponse.output = {};
			return res.json( conversationResponse );
		}
		else {
			// ***
			// * R&Rで検索を実行し結果をレスポンス文字列に挿入
			// *
			if( conversationResponse.context.isSearch ) {
				// R&R用検索クエリの構築
				console.log( "==> build a query" );
				solrQuery = qs.stringify( { q: conversationResponse.input.text, ranker_id: ranker_id, fl: "*" } );
				// クエリの送信
				console.log( "==> search documents with query on [Retrieve and Rank]" );
				solrClient.get( 'fcselect', solrQuery, function( err, searchResponse ) {
					if( err ) {
						conversationResponse.output.text = 'ERROR: failed searching documents.<br>' + err;
						return conversationResponse;
					}
					else {
						// ::: databaseQuery用に質問内容を保持 :::
						questionBody = conversationResponse.input.text;

						console.log( JSON.stringify( searchResponse ) );
						// 検索結果ドキュメントが存在する場合
						if( searchResponse.response.numFound != 0 ) {
							console.log( "  -- Service R&R could found some documents" );
							conversationResponse.context[ 'results_existance' ] = "true";
							// 検索結果表示用htmlコード生成
							var answerList = "";
							for( var i=0; i<searchResponse.response.docs.length; i++ ) {
								answerList += '[' + (i+1) + ']<br>' + searchResponse.response.docs[i].answer[0] + '<hr class="line">';
								// ::: databaseQuery用に検索結果を保持 :::
								documentIdList.push( searchResponse.response.docs[i].id );
							}
							conversationResponse.output.text[0] += '<br>' + answerList + "<br>回答結果は役に立ちましたか？<br><a class=\"select\" href=\"#\" onClick=\"ConversationPanel.inputClick(event, this);\">はい</a> / <a class=\"select\" href=\"#\" onClick=\"ConversationPanel.inputClick(event, this);\">いいえ</a>";
						}
						// 検索結果ドキュメントが存在しない場合
						else {
							console.log( "  -- Service R&R couldn't find any documents..." );
							conversationResponse.context[ 'results_existance' ] = "false";
						}
						// 検索実行トリガーの無効化
						conversationResponse.context.isSearch = false;

						console.log( "  -- output text is [" + conversationResponse.output.text[0] + "]" );
						console.log( "  -- SUCCESS : search documents" )
						return res.json( conversationResponse );
					}
				} );
			}
			else {
				if( conversationResponse.context.isPush ) {
					// ::: パラメータ初期化 :::
					id					   += 1;
					answersId 			   += 1;
					date			 		= null;
					paramsName 				= null;
					paramsValue 			= null;
					databaseQuery 			= null;
					databaseQueries.length 	= 0;
					// ::: テーブル[answers]用挿入クエリ生成 :::
					paramsName 		= 'id, document_id';
					for( var i=0; i<documentIdList.length; i++ ) {
						paramsValue 	= answersId + ', "' + documentIdList[i] + '"';
						console.log( '==> Building query' + ( i+1 ) );
						databaseQuery		= 'INSERT INTO `answers`( ' + paramsName + ' ) VALUES( ' + paramsValue + '  );';
						databaseQueries.push( databaseQuery );
						console.log( '  query' + ( i+1 ) + ' is ' + databaseQuery + '\n' );
					}
					// ::: テーブル[search_results]用挿入クエリ生成 :::
					console.log( '==> Building query' + ( i+1 ) );
					date			= new Date();
					timestamp		= date.toFormat( 'YYYY-MM-DD HH24:MI:SS' );
					listening_result= conversationResponse.intents[0].intent;
					paramsName 		= 'id, question_body, answers_id, listening_result, timestamp';
					paramsValue 	= id + ', "' + questionBody + '", ' + answersId + ', "' + listening_result + '", "' + timestamp + '"';
					databaseQuery 	= 'INSERT INTO `search_results`( ' + paramsName + ' ) VALUES( ' + paramsValue + '  );';
					databaseQueries.push( databaseQuery );
					console.log( '  query' + ( i+1 ) + ' is ' + databaseQuery + '\n' );
					// ::: データベース[okayama_city]にデータ挿入 :::
					operatorDB.execQueries( '127.0.0.1', 'kota', 'kota', 'okayama_city', databaseQueries );
					// ::: パラメータの初期化 :::
					documentIdList	= [];
					questionBody = null;
				}
				console.log( "  -- output text is [" + conversationResponse.output.text.toString() + "]" );
				return res.json( conversationResponse );
			}
		}
	});
});

module.exports = app;
