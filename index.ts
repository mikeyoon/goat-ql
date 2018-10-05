import express from 'express';
import cors from 'cors';
import { ApolloServer, gql } from 'apollo-server-express';
import GraphQLJSON from 'graphql-type-json';

import { performance } from 'perf_hooks';

import fetch from 'node-fetch';
import { GraphQLResolveInfo, FieldNode } from "graphql";

const AUTH = `${process.env.MODE_TOKEN}`;

// Construct a schema, using GraphQL schema language
const typeDefs = gql`
  scalar JSON

  interface Model {
    id: Int,
    token: ID,
    _links: JSON,
    _embedded: JSON
  }

  type Avatar {
    initials: String,
    color_class: String,
    seed: String,
    type: String
  }

  type Preference {
    default_account: Int,
    editor_theme: String,
    editor_browser_enabled: Boolean,
    features: JSON,
    hidden_banners: JSON,
    home_list_type: String,
    home_view: String,
    notebook_sidebar: JSON
  }

  type Account implements Model {
    id: Int,
    token: ID,
    name: String,
    user: Boolean,
    username: String,
    plan_code: String,

    avatar: Avatar,
    data_sources: [DataSource],
    all_color_palettes: [ColorPalette],
    preference: Preference,

    _links: JSON,
    _embedded: JSON
  }

  type DataSource implements Model {
    id: Int,
    token: ID,
    display_name: String,
    default: Boolean,
    name: String,
    public: Boolean,
    queryable: Boolean,

    _links: JSON,
    _embedded: JSON
  }

  type ReportTheme implements Model {
    id: Int,
    token: ID,
    css_href: String,
    css_source: String,
    name: String,
    type: String,

    _links: JSON,
    _embedded: JSON
  }

  type ReportRun implements Model {
    id: Int,
    token: ID,
    created_at: String,
    python_state: String
    query_runs: [QueryRun],

    _links: JSON,
    _embedded: JSON
  }

  type QueryRun implements Model {
    id: Int,
    token: ID,
    created_at: String,
    state: String,
    raw_source: String,
    rendered_source: String,
    data_source_id: Int,
    limit: Boolean,

    result: QueryRunResult,
    _links: JSON,
    _embedded: JSON
  }

  type QueryRunResult implements Model {
    id: Int,
    token: ID,
    content_length: Int,
    count: Int,
    state: String,
    csv_href: String,
    json_href: String,

    _links: JSON,
    _embedded: JSON
  }

  type ReportQuery implements Model {
    id: Int,
    token: ID,
    name: String,
    raw_query: String,
    data_source_id: Int,

    charts: [Chart],
    query_tables: [Table],

    _links: JSON,
    _embedded: JSON
  }

  type ColorPalette implements Model {
    id: Int,
    token: ID,
    name: String,
    palette_type: String,
    value: String,

    _links: JSON,
    _embedded: JSON
  }

  type Chart implements Model {
    id: Int,
    token: ID,
    color_palette_token: ID,
    view: JSON,
    view_vegas: JSON,
    view_version: Int,

    color_palette: ColorPalette,

    _links: JSON,
    _embedded: JSON
  }

  type Table implements Model {
    id: Int,
    token: ID,
    view: JSON,

    _links: JSON,
    _embedded: JSON
  }

  type Report implements Model {
    id: Int
    token: ID,
    name: String,
    layout: String,
    description: String,
    last_run_token: ID,
    web_preview_image: String,
    full_width: Boolean,
    created_at: String,
    is_embedded: Boolean,
    is_signed: Boolean,
    public: Boolean,

    report_theme: ReportTheme,
    queries: [ReportQuery],
    python_notebook: Notebook,
    python_visualizations: [NotebookVisualization],
    last_run: ReportRun,
    owner: Account,

    _links: JSON,
    _embedded: JSON
  }

  type Notebook implements Model {
    id: Int,
    token: ID,

    _links: JSON,
    _embedded: JSON
  }

  type NotebookVisualization implements Model {
    id: Int,
    token: ID,

    _links: JSON,
    _embedded: JSON
  }

  type Query {
    account(name: String): Account,
    datasources: [DataSource]!
    report(username: String, token: ID): Report
  }
`;

interface ModeResource {
  _embedded: {
    [index: string]: {
      [index: string]: any;
      _embedded?: {
        [index: string]: any[]
      };
    };
  };
  _links: {
    [key: string]: { href: string };
  };
}

interface Account extends ModeResource {
  name: string;
  token: string;
  id: number;
  user: boolean;
  username: string;
  plan_code: string;
  avatar: any;
}

const resolvers = {
  JSON: GraphQLJSON,
  Query: {
    account: getAccount,
    report: getReport
  },
};

function get(url: string) {
  return fetch('https://staging.modeanalytics.com' + url, {
    headers: {
      // "Authorization": AUTH,
      // "accept-encoding": "gzip, deflate, br",
      "Cookie": AUTH
    }
  })
}

async function getReport(_parent: any, args: any, _context: any, info: GraphQLResolveInfo) {
  const set = info.fieldNodes[0].selectionSet;
  let embeds: string[] = [];
  let getLastRun = false;

  if (set != null) {
    const fields = set.selections.filter(s => s.kind === 'Field') as FieldNode[];
    for (const field of fields) {
      switch (field.name.value) {
        case 'report_theme':
          embeds.push('embed[report_theme]');
          break;
        case 'queries':
          embeds.push('embed[queries][queries][query_tables]')
          embeds.push('embed[queries][queries][charts][charts][color_palette]');
          break;
        case 'python_notebook':
          embeds.push('embed[python_notebook]');
          break;
        case 'python_visualizations':
          embeds.push('embed[python_visualizations][python_visualizations][python_cell]');
          embeds.push('embed[python_visualizations][python_visualizations][python_cell_run][python_cell_run_results]');
          break;
        case 'last_run':
          getLastRun = true;
          break;
        case 'space':
          embeds.push('embed[space]');
          break;
      }
    }
  }

  let url = `/api/${args.username}/reports/${args.token}?trk_source=editor`;
  for (let embed of embeds) {
    url += `&${embed}=1`
  }

  const startTime = performance.now();
  const response = await get(url);
  const val = await response.json();
  console.log(url, performance.now() - startTime);

  let retVal = {
    ...val,
    report_theme: getEmbedValue(val, 'report_theme'),
    queries: getEmbedArray(val, 'queries').map(q => {
      let charts = getEmbedArray(q, 'charts');
      let tables = getEmbedArray(q, 'query_tables');

      return {
        ...q,
        charts: charts.map(c => {
          let palette = getEmbedValue(c, 'color_palette');
          return {
            ...c,
            color_palette: palette
          }
        }),
        tables
      }
    })
  };

  if (getLastRun) {
    let runUrl = `${val._links['last_run'].href}?embed[query_runs][result]=1`
    const startTime = performance.now();
    const runResponse = await get(runUrl);
    const runVal = await runResponse.json();
    console.log(runUrl, performance.now() - startTime);
    retVal = {
      ...retVal,
      last_run: {
        ...runVal,
        query_runs: getEmbedArray(runVal, 'query_runs').map(qr => {
          const result = getEmbedValue(qr, 'result');
          return {
            ...qr,
            ...result != null ? {
              result: {
                ...result,
                csv_href: result._links['csv'].href,
                json_href: result._links['json'].href
              }
            } : {}
          };
        })
      }
    };
  }

  console.timeEnd("Get Report");

  return retVal;
}

async function getAccount(_parent: any, args: any, _context: any, info: GraphQLResolveInfo) {
  console.time("Get Account");
  const set = info.fieldNodes[0].selectionSet;
  let embeds: string[] = [];

  if (set != null) {
    const fields = set.selections.filter(s => s.kind === 'Field') as FieldNode[];
    for (let field of fields) {
      switch (field.name.value) {
        case 'data_sources':
          embeds.push('embed[data_sources][data_sources]');
          break;
        case 'preference':
          embeds.push('embed[preference]');
          break;
        case 'all_color_palettes':
          embeds.push('embed[all_color_palettes]');
          break;
      }
    }
  }

  let url = '/api/' + args.name + "?trk_source=report";
  for (let embed of embeds) {
    url += `&${embed}=1`
  }

  console.log(url);
  let response = await get(url);
  let val = await response.json() as Account;
  console.timeEnd("Get Account");
  return {
    ...val,
    data_sources: getEmbedArray(val, 'data_sources'),
    all_color_palettes: getEmbedArray(val, 'all_color_palettes'),
    preference: getEmbedValue(val, 'preference')
  };
}

function getEmbedValue(resource: ModeResource, name: string) {
  if (resource._embedded && resource._embedded[name]) {
    return resource._embedded[name];
  }
}

function getEmbedArray(resource: ModeResource, name: string) {
  if (resource._embedded && resource._embedded[name] && resource._embedded[name] && resource._embedded[name]._embedded) {
    const embedded = resource._embedded[name]._embedded;
    if (embedded != null) {
      return embedded[name];
    }
  }

  return [];
}

const server = new ApolloServer({ typeDefs, resolvers });
const app = express();
app.use(cors());
server.applyMiddleware({ app });

app.listen({ port: 4000 }, () =>
  console.log(`🚀 Server ready at http://localhost:4000${server.graphqlPath}`),
);
