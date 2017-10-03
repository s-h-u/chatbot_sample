var mysql = require( './operateDB.js' );

	mysql.connect( 'localhost', 'kota', 'kota', 'example_schema', 'SELECT * FROM example_table' );

