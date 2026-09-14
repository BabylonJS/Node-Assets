declare const connectionPointData: unique symbol;

export interface ConnectionPointType<Payload> {
    readonly id: string;
    readonly hasLifetime: boolean;
    readonly [connectionPointData]: Payload;
    is(value: unknown): value is Payload;
}

export type ConnectionPointValue<C extends ConnectionPointType<unknown>> = C extends ConnectionPointType<infer TData> ? TData : never;

export function defineConnectionPointType<P>(id: string, isData: (value: unknown) => value is P, hasLifetime = false): ConnectionPointType<P> {
    return Object.freeze({ hasLifetime, id, is: isData }) as ConnectionPointType<P>;
}
