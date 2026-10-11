import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const profiles=sqliteTable('profiles',{id:text('id').primaryKey(),email:text('email').notNull(),data:text('data').notNull(),updated:text('updated').notNull()});
export const inventory=sqliteTable('inventory',{id:text('id').primaryKey(),data:text('data').notNull()});
export const orders=sqliteTable('orders',{id:text('id').primaryKey(),userId:text('user_id').notNull(),status:text('status').notNull(),total:integer('total').notNull(),data:text('data').notNull(),created:text('created').notNull()});
export const applications=sqliteTable('applications',{id:text('id').primaryKey(),userId:text('user_id').notNull(),type:text('type').notNull(),status:text('status').notNull(),data:text('data').notNull(),created:text('created').notNull()});
export const settings=sqliteTable('settings',{id:text('id').primaryKey(),data:text('data').notNull()});
export const inquiries=sqliteTable('inquiries',{id:text('id').primaryKey(),userId:text('user_id').notNull(),data:text('data').notNull(),created:text('created').notNull()});
