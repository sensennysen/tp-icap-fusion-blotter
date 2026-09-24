-- tradeId used to be derived from count(), so concurrent creates could be
-- issued the same code. nextval() is atomic, so each create gets its own
-- number. The sequence is positioned past any TRD-<n> already in the table.
CREATE SEQUENCE "trade_id_seq" MINVALUE 100000 START 100001;

SELECT setval(
  'trade_id_seq',
  COALESCE(
    (SELECT MAX(substring("tradeId" FROM 5)::bigint) FROM "trades" WHERE "tradeId" ~ '^TRD-[0-9]+$'),
    100000
  )
);
