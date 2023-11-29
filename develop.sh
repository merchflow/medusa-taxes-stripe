#!/bin/bash

		#Run migrations to ensure the database is updated
		medusa migrations run
		
		#npm run seed
		yarn install

		#Start development environment
		yarn start