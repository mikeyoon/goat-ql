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

    report: Report,
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
    report_run(username: String, reportToken: String, runToken: String): ReportRun
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

const resolvers = {
  JSON: GraphQLJSON,
  Query: {
    account: getAccount,
    report: getReport,
    report_run: getReportRun,
  },
  Account: {
    preference: getEmbedValueResolver,
    data_sources: getEmbedValueResolver,
    all_color_palettes: getEmbedValueResolver
  },
  Report: {
    report_theme: getEmbedValueResolver,
    queries: getEmbedValueResolver,
    owner: getEmbedValueResolver,
    last_run: getReportRunResolver
  },
  ReportRun: {
    report: getEmbedValueResolver,
    query_runs: getEmbedValueResolver
  },
  QueryRun: {
    result: getEmbedValueResolver
  },
  ReportQuery: {
    charts: getEmbedValueResolver,
    query_tables: getEmbedValueResolver
  },
  Chart: {
    color_palette: getEmbedValueResolver
  }
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

async function getReportRun(_parent: any, args: any, _context: any, info: GraphQLResolveInfo) {
  const set = info.fieldNodes[0].selectionSet;
  let embeds: string[] = [];

  embeds.push('embed[executed_by]:');
  embeds.push('embed[new_pdf_export]:');
  embeds.push('embed[new_report_run_email]:');
  embeds.push('embed[new_report_run_slack_message]:');
  embeds.push('embed[pdf_export]:');
  embeds.push('embed[python_cell_runs][python_cell_runs][python_cell_run_results]:');

  if (set != null) {
    const fields = set.selections.filter(s => s.kind === 'Field') as FieldNode[];
    for (const field of fields) {
      switch (field.name.value) {
        case 'report':
          embeds.push('embed[report][new_embed_key]');
          embeds.push('embed[report][new_report_schedule]');
          embeds.push('embed[report][new_report_subscription]');
          embeds.push('embed[report][new_star]');
          embeds.push('embed[report][python_visualizations][python_visualizations][python_cell]');
          embeds.push('embed[report][python_visualizations][python_visualizations][python_cell_run][python_cell_run_results]');
          embeds.push('embed[report][queries][queries][charts][charts][color_palette]');
          embeds.push('embed[report][queries][queries][query_tables]');
          embeds.push('embed[report][report_filters]');
          embeds.push('embed[report][report_theme]');
          embeds.push('embed[report][space]');
          break;
      }
    }
  }

  let url = `/api/${args.username}/reports/${args.reportToken}/runs/${args.runToken}?trk_source=editor`;
  for (let embed of embeds) {
    url += `&${embed}=1`
  }

  const startTime = performance.now();
  const response = await get(url);
  const val = await response.json();
  console.log(url, performance.now() - startTime);

  return val;
}

async function getReport(_parent: any, args: any, _context: any, info: GraphQLResolveInfo) {
  const set = info.fieldNodes[0].selectionSet;
  let embeds: string[] = [];

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
  return val;
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
  let val = await response.json();
  console.timeEnd("Get Account");
  return val;
}

async function getReportRunResolver(parent: ModeResource, _args: any, _context: any, info: GraphQLResolveInfo) {
  let runUrl = `${parent._links[info.fieldName].href}?embed[query_runs][result]=1`;
  const runResponse = await get(runUrl);
  const runVal = await runResponse.json();

  return runVal;
}

function getEmbedValueResolver(parent: ModeResource, _args: any, _context: any, info: GraphQLResolveInfo) {
  const val = getEmbed(parent, info.fieldName);

  // TODO: do stuff
  return val;
}

function getEmbed(resource: ModeResource, name: string) {
  if (resource._embedded && resource._embedded[name]) {
    const embed = resource._embedded[name]._embedded;
    if (embed != null && embed[name] != null) {
      return getEmbedArray(resource, name);
    } else {
      return getEmbedValue(resource, name);
    }
  }
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
