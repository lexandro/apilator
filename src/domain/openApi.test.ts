import { describe, it, expect } from 'vitest';
import {
  pathToTemplate,
  baseUrlOf,
  exampleForSchema,
  isOpenApiSpec,
  collectionFromOpenApi,
} from './openApi';
import type { CollectionFolderNode, CollectionRequestNode } from './collection';

function spec(overrides: Record<string, unknown> = {}) {
  return {
    openapi: '3.0.0',
    info: { title: 'Test API' },
    servers: [{ url: 'https://api.test/v1' }],
    paths: {
      '/users': {
        get: { summary: 'List users', tags: ['users'] },
      },
    },
    ...overrides,
  };
}

function importOf(raw: unknown) {
  const result = collectionFromOpenApi(raw);
  if (!result) throw new Error('expected a collection');
  return result;
}

function requestsOf(nodes: ReturnType<typeof importOf>['collection']['children']) {
  const found: CollectionRequestNode[] = [];
  const visit = (list: typeof nodes) => {
    for (const node of list) {
      if (node.kind === 'request') found.push(node);
      else visit(node.children);
    }
  };
  visit(nodes);
  return found;
}

describe('pathToTemplate', () => {
  it('converts an OpenAPI path parameter to our placeholder syntax', () => {
    expect(pathToTemplate('/users/{id}')).toBe('/users/{{id}}');
  });

  it('converts several parameters', () => {
    expect(pathToTemplate('/{a}/x/{b}')).toBe('/{{a}}/x/{{b}}');
  });

  it('leaves a plain path alone', () => {
    expect(pathToTemplate('/users')).toBe('/users');
  });
});

describe('baseUrlOf', () => {
  it('uses the first server', () => {
    expect(baseUrlOf({ servers: [{ url: 'https://a.test' }, { url: 'https://b.test' }] })).toBe(
      'https://a.test'
    );
  });

  it('strips a trailing slash so paths do not double up', () => {
    expect(baseUrlOf({ servers: [{ url: 'https://a.test/' }] })).toBe('https://a.test');
  });

  it('is empty when there is no server', () => {
    expect(baseUrlOf({})).toBe('');
    expect(baseUrlOf({ servers: [] })).toBe('');
  });
});

describe('exampleForSchema', () => {
  it('prefers an explicit example', () => {
    expect(exampleForSchema({ type: 'string', example: 'hi' })).toBe('hi');
  });

  it('falls back to a default', () => {
    expect(exampleForSchema({ type: 'string', default: 'def' })).toBe('def');
  });

  it('falls back to the first enum value', () => {
    expect(exampleForSchema({ type: 'string', enum: ['a', 'b'] })).toBe('a');
  });

  it.each([
    [{ type: 'string' }, 'string'],
    [{ type: 'integer' }, 0],
    [{ type: 'number' }, 0],
    [{ type: 'boolean' }, false],
  ])('produces a placeholder for %o', (schema, expected) => {
    expect(exampleForSchema(schema)).toBe(expected);
  });

  it('formats a date-time string recognisably', () => {
    expect(exampleForSchema({ type: 'string', format: 'date-time' })).toBe(
      '1970-01-01T00:00:00Z'
    );
  });

  it('builds an object from its properties', () => {
    expect(
      exampleForSchema({ type: 'object', properties: { a: { type: 'string' }, b: { type: 'integer' } } })
    ).toEqual({ a: 'string', b: 0 });
  });

  it('infers object from properties even without a type', () => {
    expect(exampleForSchema({ properties: { a: { type: 'boolean' } } })).toEqual({ a: false });
  });

  it('builds a single-element array', () => {
    expect(exampleForSchema({ type: 'array', items: { type: 'string' } })).toEqual(['string']);
  });

  it('gives up on a deeply nested schema rather than recursing forever', () => {
    let schema: Record<string, unknown> = { type: 'string' };
    for (let i = 0; i < 20; i++) schema = { type: 'object', properties: { next: schema } };

    expect(() => exampleForSchema(schema)).not.toThrow();
  });

  it('returns null for a non-object', () => {
    expect(exampleForSchema('nope')).toBeNull();
  });
});

describe('isOpenApiSpec', () => {
  it('accepts a document with openapi and paths', () => {
    expect(isOpenApiSpec(spec())).toBe(true);
  });

  it('rejects one without paths', () => {
    expect(isOpenApiSpec({ openapi: '3.0.0' })).toBe(false);
  });

  it('rejects a swagger 2 document', () => {
    expect(isOpenApiSpec({ swagger: '2.0', paths: {} })).toBe(false);
  });

  it('rejects a non-object', () => {
    expect(isOpenApiSpec(null)).toBe(false);
    expect(isOpenApiSpec([])).toBe(false);
  });
});

describe('collectionFromOpenApi', () => {
  it('returns null for something that is not a spec', () => {
    expect(collectionFromOpenApi({ hello: 'world' })).toBeNull();
  });

  it('names the collection after the API title', () => {
    expect(importOf(spec()).collection.name).toBe('Test API');
  });

  it('falls back to a generic name without a title', () => {
    expect(importOf(spec({ info: {} })).collection.name).toBe('Imported API');
  });

  it('creates one request per operation', () => {
    const result = importOf(
      spec({
        paths: {
          '/users': { get: {}, post: {} },
          '/health': { get: {} },
        },
      })
    );

    expect(result.requestCount).toBe(3);
  });

  it('builds the full url from the server and path', () => {
    const [request] = requestsOf(importOf(spec()).collection.children);
    expect(request.request.url).toBe('https://api.test/v1/users');
  });

  it('turns path parameters into placeholders an environment can fill', () => {
    const result = importOf(spec({ paths: { '/users/{id}': { get: {} } } }));
    expect(requestsOf(result.collection.children)[0].request.url).toBe(
      'https://api.test/v1/users/{{id}}'
    );
  });

  it('uses the summary as the request name', () => {
    expect(requestsOf(importOf(spec()).collection.children)[0].name).toBe('List users');
  });

  it('falls back to the operationId, then to method and path', () => {
    const byId = importOf(spec({ paths: { '/a': { get: { operationId: 'getA' } } } }));
    expect(requestsOf(byId.collection.children)[0].name).toBe('getA');

    const byPath = importOf(spec({ paths: { '/a': { get: {} } } }));
    expect(requestsOf(byPath.collection.children)[0].name).toBe('GET /a');
  });

  it('groups operations into folders by their first tag', () => {
    const result = importOf(
      spec({
        paths: {
          '/users': { get: { tags: ['users'] } },
          '/orders': { get: { tags: ['orders'] } },
        },
      })
    );

    const folders = result.collection.children.filter(
      (n): n is CollectionFolderNode => n.kind === 'folder'
    );
    expect(folders.map((f) => f.name).sort()).toEqual(['orders', 'users']);
  });

  it('puts untagged operations at the root', () => {
    const result = importOf(spec({ paths: { '/health': { get: {} } } }));

    expect(result.collection.children[0].kind).toBe('request');
  });

  it('picks up every supported method', () => {
    const paths = { '/x': { get: {}, post: {}, put: {}, patch: {}, delete: {}, head: {}, options: {} } };
    const result = importOf(spec({ paths }));

    expect(requestsOf(result.collection.children).map((r) => r.request.method).sort()).toEqual(
      ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT']
    );
  });

  it('ignores keys that are not operations', () => {
    const result = importOf(spec({ paths: { '/x': { get: {}, description: 'not an operation' } } }));
    expect(result.requestCount).toBe(1);
  });

  it('adds required query parameters enabled and optional ones disabled', () => {
    const result = importOf(
      spec({
        paths: {
          '/users': {
            get: {
              parameters: [
                { name: 'page', in: 'query', required: true, schema: { type: 'integer' } },
                { name: 'sort', in: 'query', schema: { type: 'string' } },
              ],
            },
          },
        },
      })
    );

    const params = requestsOf(result.collection.children)[0].request.params;
    expect(params.map((p) => [p.key, p.enabled])).toEqual([
      ['page', true],
      ['sort', false],
    ]);
  });

  it('adds header parameters to the headers', () => {
    const result = importOf(
      spec({
        paths: {
          '/users': {
            get: { parameters: [{ name: 'X-Tenant', in: 'header', required: true }] },
          },
        },
      })
    );

    const headers = requestsOf(result.collection.children)[0].request.headers;
    expect(headers.some((h) => h.key === 'X-Tenant')).toBe(true);
  });

  it('inherits path level parameters', () => {
    const result = importOf(
      spec({
        paths: {
          '/users': {
            parameters: [{ name: 'shared', in: 'query', required: true }],
            get: {},
          },
        },
      })
    );

    expect(requestsOf(result.collection.children)[0].request.params[0].key).toBe('shared');
  });

  it('ignores path parameters in the query list, since they are already in the url', () => {
    const result = importOf(
      spec({
        paths: { '/users/{id}': { get: { parameters: [{ name: 'id', in: 'path', required: true }] } } },
      })
    );

    expect(requestsOf(result.collection.children)[0].request.params).toEqual([]);
  });

  it('builds a JSON body from the request schema', () => {
    const result = importOf(
      spec({
        paths: {
          '/users': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: { name: { type: 'string' }, age: { type: 'integer' } },
                    },
                  },
                },
              },
            },
          },
        },
      })
    );

    const body = requestsOf(result.collection.children)[0].request.body;
    expect(body.type).toBe('raw');
    expect(JSON.parse(body.raw.content)).toEqual({ name: 'string', age: 0 });
  });

  it('prefers an explicit body example', () => {
    const result = importOf(
      spec({
        paths: {
          '/users': {
            post: {
              requestBody: { content: { 'application/json': { example: { hello: 'world' } } } },
            },
          },
        },
      })
    );

    expect(JSON.parse(requestsOf(result.collection.children)[0].request.body.raw.content)).toEqual({
      hello: 'world',
    });
  });

  it('leaves the body alone for a non-JSON request body', () => {
    const result = importOf(
      spec({
        paths: {
          '/upload': { post: { requestBody: { content: { 'application/octet-stream': {} } } } },
        },
      })
    );

    expect(requestsOf(result.collection.children)[0].request.body.type).toBe('none');
  });

  it('resolves a $ref schema in the request body', () => {
    const result = importOf(
      spec({
        paths: {
          '/users': {
            post: {
              requestBody: {
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/User' } },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            User: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                address: { $ref: '#/components/schemas/Address' },
                tags: { type: 'array', items: { $ref: '#/components/schemas/Tag' } },
              },
            },
            Address: { type: 'object', properties: { city: { type: 'string', example: 'Pécs' } } },
            Tag: { type: 'string', enum: ['admin', 'user'] },
          },
        },
      })
    );

    const body = requestsOf(result.collection.children)[0].request.body;
    expect(JSON.parse(body.raw.content)).toEqual({
      name: 'string',
      address: { city: 'Pécs' },
      tags: ['admin'],
    });
  });

  it('resolves a $ref request body', () => {
    const result = importOf(
      spec({
        paths: {
          '/users': {
            post: { requestBody: { $ref: '#/components/requestBodies/NewUser' } },
          },
        },
        components: {
          requestBodies: {
            NewUser: {
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { email: { type: 'string' } } },
                },
              },
            },
          },
        },
      })
    );

    expect(JSON.parse(requestsOf(result.collection.children)[0].request.body.raw.content)).toEqual({
      email: 'string',
    });
  });

  it('merges allOf and takes the first oneOf branch', () => {
    const result = importOf(
      spec({
        paths: {
          '/pets': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      allOf: [
                        { $ref: '#/components/schemas/Base' },
                        {
                          type: 'object',
                          properties: {
                            kind: { oneOf: [{ type: 'integer' }, { type: 'string' }] },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: { Base: { type: 'object', properties: { id: { type: 'integer' } } } },
        },
      })
    );

    expect(JSON.parse(requestsOf(result.collection.children)[0].request.body.raw.content)).toEqual({
      id: 0,
      kind: 0,
    });
  });

  it('resolves a $ref parameter', () => {
    const result = importOf(
      spec({
        paths: {
          '/users': {
            get: { parameters: [{ $ref: '#/components/parameters/Limit' }] },
          },
        },
        components: {
          parameters: {
            Limit: { name: 'limit', in: 'query', required: true, schema: { type: 'integer', default: 20 } },
          },
        },
      })
    );

    const [param] = requestsOf(result.collection.children)[0].request.params;
    expect([param.key, param.value, param.enabled]).toEqual(['limit', '20', true]);
  });

  it('stops at a self-referencing schema instead of recursing forever', () => {
    const result = importOf(
      spec({
        paths: {
          '/nodes': {
            post: {
              requestBody: {
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/Node' } },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            Node: {
              type: 'object',
              properties: { name: { type: 'string' }, parent: { $ref: '#/components/schemas/Node' } },
            },
          },
        },
      })
    );

    expect(JSON.parse(requestsOf(result.collection.children)[0].request.body.raw.content)).toEqual({
      name: 'string',
      parent: null,
    });
  });

  it('treats a $ref that points nowhere as an unknown schema', () => {
    expect(exampleForSchema({ $ref: '#/components/schemas/Missing' }, {})).toBeNull();
    expect(exampleForSchema({ $ref: 'other.yaml#/User' }, {})).toBeNull();
  });

  it('handles an empty paths object', () => {
    const result = importOf(spec({ paths: {} }));

    expect(result.requestCount).toBe(0);
    expect(result.collection.children).toEqual([]);
  });

  it('gives every request a distinct id', () => {
    const result = importOf(spec({ paths: { '/a': { get: {} }, '/b': { get: {} } } }));
    const ids = requestsOf(result.collection.children).map((r) => r.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
