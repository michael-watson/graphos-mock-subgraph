const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const {
  toPromise,
  execute,
  createHttpLink,
  gql,
} = require("@apollo/client/core");
const { buildSubgraphSchema } = require("@apollo/subgraph");
const { addMocksToSchema } = require("@graphql-tools/mock");
const { graphql } = require("graphql");
const fetch = require("node-fetch");
app.use(bodyParser.json());

const port = process.env.PORT ?? 6000;

app.post("/", async (req, res) => {
  const operation = req.body?.query ?? undefined;
  if (operation === undefined) res.send(null);

  const variableValues = req.body?.variables ?? [];

  const graphosKey = req.header("x-api-key");
  const graphId = req.header("graph-id");
  const variant = req.header("variant-name");
  const subgraphName = req.header("subgraph-name");

  if (
    graphosKey === undefined ||
    graphId === undefined ||
    variant === undefined ||
    subgraphName === undefined
  )
    res.send(null);
  else {
    const response = await getGraphSchemasByVariant(
      graphosKey,
      `${graphId}@${variant}`,
      subgraphName
    );
    if (response?.data?.variant?.subgraph?.activePartialSchema?.sdl) {
      const schemaString =
        response.data.variant.subgraph.activePartialSchema?.sdl;
      const schema = buildSubgraphSchema({ typeDefs: gql(schemaString) });
      const schemaWithMocks = addMocksToSchema({
        schema,
        preserveResolvers: true,
      });

      const result = await graphql({
        schema: schemaWithMocks,
        source: operation,
        variableValues,
      });
      res.send(result);
    } else return res.send(null);
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

const getSubgraphSchema = gql(`
  query SubgraphSchema($ref: ID!, $name: ID!) {
    variant(ref: $ref) {
      ... on GraphVariant {
        subgraph(name: $name) {
          activePartialSchema {
            sdl
          }
        }
      }
    }
  }
`);

function getGraphSchemasByVariant(apiKey, ref, name) {
  return toPromise(
    execute(createLink(apiKey), {
      query: getSubgraphSchema,
      variables: {
        ref,
        name,
      },
    })
  );
}

function createLink(apiKey) {
  const headers = {
    "x-api-key": apiKey,
    "apollographql-client-name": "mock-subgraph",
    "apollographql-client-version": 'beta',
  };

  return createHttpLink({
    fetch,
    headers,
    uri: "https://api.apollographql.com/graphql",
  });
}
