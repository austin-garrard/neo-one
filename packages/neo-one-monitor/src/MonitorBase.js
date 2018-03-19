/* @flow */
import type { Context } from 'koa';
import type {
  Carrier,
  CaptureLogOptions,
  CaptureLogSingleOptions,
  CaptureMonitor,
  CaptureSpanOptions,
  CaptureSpanLogOptions,
  Counter,
  Format,
  Gauge,
  Histogram,
  Labels,
  LogErrorOptions,
  LogErrorSingleOptions,
  LogLevelOption,
  LogSingleOptions,
  LogLevel,
  LogMetricOptions,
  LogOptions,
  MetricOptions,
  Monitor,
  Span,
  SpanContext,
  SpanOptions,
  Summary,
} from './types';
import createTracer from './createTracer';

export type LoggerLogOptions = {|
  name: string,
  level: LogLevel,
  message?: string,
  labels?: Labels,
  data?: Labels,
  error?: ?Error,
|};

export type FullLogLevelOption = {|
  log: LogLevel,
  metric: LogLevel,
  span: LogLevel,
|};

export interface Logger {
  log(options: LoggerLogOptions): void;
  close(callback: () => void): void;
}

export interface TracerSpan {
  log(data: Object): void;
  setTag(name: string, value: string | number | boolean): void;
  finish(): void;
  context(): SpanContext;
}
export type TracerReference = any;
export type TracerStartSpanOptions = {|
  references?: Array<TracerReference>,
  tags?: Object,
|};

export interface Tracer {
  startSpan(name: string, options?: TracerStartSpanOptions): TracerSpan;
  childOf(span: SpanContext | TracerSpan): TracerReference;
  followsFrom(span: SpanContext | TracerSpan): TracerReference;
  extract(format: Format, carrier: Carrier): SpanContext;
  inject(context: SpanContext, format: Format, carrier: Carrier): void;
  close(callback: () => void): void;
}

export type Now = () => number;

export type RawLabels = Labels;
export type TagLabels = Labels;
export type MetricLabels = Labels;

type SpanData = {|
  histogram?: {|
    name: string,
    help?: string,
  |},
  time: number,
  span?: TracerSpan,
|};

export type MetricConstruct = {|
  ...MetricOptions,
  metricLabels: MetricLabels,
|};

export interface MetricsFactory {
  createCounter(options: MetricConstruct): Counter;
  createGauge(options: MetricConstruct): Gauge;
  createHistogram(options: MetricConstruct): Histogram;
  createSummary(options: MetricConstruct): Summary;
}

type MonitorBaseOptions = {|
  namespace: string,
  labels?: RawLabels,
  data?: RawLabels,
  logger: Logger,
  tracer?: Tracer,
  now: Now,
  metricsLogLevel?: LogLevel,
  spanLogLevel?: LogLevel,
  span?: SpanData,
  metricsFactory: MetricsFactory,
|};

const counters: { [name: string]: Counter } = {};
const gauges: { [name: string]: Gauge } = {};
const histograms: { [name: string]: Histogram } = {};
const summaries: { [name: string]: Summary } = {};

const KNOWN_LABELS = {
  DB_INSTANCE: 'db.instance',
  DB_STATEMENT: 'db.statement',
  DB_TYPE: 'db.type',
  DB_USER: 'db.user',
  ERROR: 'error',
  HTTP_METHOD: 'http.method',
  HTTP_STATUS_CODE: 'http.status_code',
  HTTP_URL: 'http.url',
  MESSAGE_BUS_DESTINATION: 'message_bus.destination',
  PEER_ADDRESS: 'peer.address',
  PEER_HOSTNAME: 'peer.hostname',
  PEER_IPV4: 'peer.ipv4',
  PEER_IPV6: 'peer.ipv6',
  PEER_PORT: 'peer.port',
  PEER_SERVICE: 'peer.service',
  SAMPLING_PRIORITY: 'sampling.priority',
  SPAN_KIND: 'span.kind',

  HTTP_PATH: 'http.path',
  RPC_METHOD: 'rpc.method',
  RPC_TYPE: 'rpc.type',
};

const FORMATS = {
  HTTP: 'http_headers',
  TEXT: 'text_map',
  BINARY: 'binary',
};

const KNOWN_LABELS_SET = new Set(Object.values(KNOWN_LABELS));

export const convertMetricLabel = (dotLabel: string): string =>
  dotLabel.replace('.', '_');

export const convertMetricLabels = (labelsIn?: RawLabels): MetricLabels => {
  if (labelsIn == null) {
    return {};
  }

  const labels = {};
  for (const key of Object.keys(labels)) {
    labels[convertMetricLabel(key)] = labels[key];
  }
  return labels;
};

export const convertTagLabel = (dotLabel: string): string => {
  if (KNOWN_LABELS_SET.has(dotLabel)) {
    return dotLabel;
  }

  return `label.${dotLabel}`;
};

export const convertTagLabels = (labelsIn?: RawLabels): TagLabels => {
  if (labelsIn == null) {
    return {};
  }

  const labels = {};
  for (const key of Object.keys(labels)) {
    labels[convertTagLabel(key)] = labels[key];
  }
  return labels;
};

const LOG_LEVEL_TO_LEVEL = {
  error: 0,
  warn: 1,
  info: 2,
  verbose: 3,
  debug: 4,
  silly: 5,
};

type ReferenceType = 'childOf' | 'followsFrom';

class DefaultReference {
  _type: ReferenceType;
  _span: SpanContext | MonitorBase;

  constructor(span: SpanContext | MonitorBase) {
    this._span = span;
  }

  isValid(): boolean {
    // eslint-disable-next-line
    return !(this._span instanceof MonitorBase) || this._span.hasSpan();
  }

  getTracerReference(tracer: Tracer): ?TracerReference {
    if (!this.isValid()) {
      throw new Error('Programming error');
    }

    let context = this._span;
    // eslint-disable-next-line
    if (context instanceof MonitorBase) {
      context = context.getSpan().span;
    }

    if (context == null) {
      return null;
    }

    return this._type === 'childOf'
      ? tracer.childOf(context)
      : tracer.followsFrom(context);
  }
}

class ChildOfReference extends DefaultReference {
  _type = 'childOf';
}

class FollowsFromReference extends DefaultReference {
  _type = 'followsFrom';
}

type CommonLogOptions = {|
  name: string,
  message?: string,
  level?: LogLevelOption,

  help?: string,
  metric?: LogMetricOptions,

  labels?: Labels,
  data?: Labels,

  error?: {
    error?: ?Error,
    message?: string,
    level?: LogLevel,
  },
|};

export default class MonitorBase implements Span {
  labels = KNOWN_LABELS;
  formats = FORMATS;
  _namespace: string;
  _labels: RawLabels;
  _data: RawLabels;
  _logger: Logger;
  _metricsLogLevel: LogLevel;
  _spanLogLevel: LogLevel;
  _tracer: Tracer;
  now: Now;
  _span: SpanData | void;
  _metricsFactory: MetricsFactory;

  constructor({
    namespace,
    labels,
    data,
    logger,
    metricsLogLevel,
    spanLogLevel,
    tracer,
    now,
    span,
    metricsFactory,
  }: MonitorBaseOptions) {
    this._namespace = namespace;
    this._labels = labels || {};
    this._data = data || {};
    this._logger = logger;
    this._metricsLogLevel =
      metricsLogLevel == null ? 'verbose' : metricsLogLevel;
    this._spanLogLevel = spanLogLevel == null ? 'info' : spanLogLevel;
    this._tracer = tracer || createTracer();
    this.now = now;
    this._span = span;
    this._metricsFactory = metricsFactory;
  }

  nowSeconds(): number {
    return this.now() / 1000;
  }

  at(namespace: string): Monitor {
    return this._clone({ namespace });
  }

  sub(namespace: string): Monitor {
    return this._clone({ namespace: `${this._namespace}_${namespace}` });
  }

  withLabels(labels: RawLabels): Monitor {
    return this._clone({ mergeLabels: labels });
  }

  withData(data: RawLabels): Monitor {
    return this._clone({ mergeData: data });
  }

  forRequest(ctx: Context): Monitor {
    return this.withLabels({
      [KNOWN_LABELS.HTTP_METHOD]: ctx.method,
      [KNOWN_LABELS.SPAN_KIND]: 'server',
    }).withData({
      [KNOWN_LABELS.HTTP_URL]: ctx.originalUrl || ctx.url,
      [KNOWN_LABELS.HTTP_PATH]: ctx.path,
    });
  }

  log({ name, message, level, help, metric, error }: LogOptions): void {
    this._commonLog({
      name,
      message,
      level,
      help,
      metric:
        metric == null
          ? {
              type: 'counter',
              suffix: 'total',
            }
          : metric,
      error,
    });
  }

  captureLog(
    func: (monitor: CaptureMonitor) => $FlowFixMe,
    options: CaptureLogOptions,
  ): $FlowFixMe {
    let { error: errorObj } = options;
    if (errorObj == null) {
      errorObj = undefined;
    } else if (typeof errorObj === 'string') {
      errorObj = { message: errorObj, level: 'error' };
    }
    const errorObjFinal = errorObj;
    const doLog = (error?: ?Error) =>
      this.log({
        name: options.name,
        message: options.message,
        level: options.level,
        help: options.help,
        metric: options.metric,
        error:
          errorObjFinal == null
            ? undefined
            : {
                message: errorObjFinal.message,
                error,
                level: errorObjFinal.level,
              },
      });

    try {
      const result = func(this);

      if (result != null && result.then != null) {
        return result
          .then(res => {
            doLog();
            return res;
          })
          .catch(err => {
            doLog(err);
            throw err;
          });
      }

      doLog();
      return result;
    } catch (error) {
      doLog(error);
      throw error;
    }
  }

  logSingle({ name, message, level, error }: LogSingleOptions): void {
    this._commonLog({ name, message, level, error });
  }

  captureLogSingle(
    func: (monitor: CaptureMonitor) => $FlowFixMe,
    options: CaptureLogSingleOptions,
  ): $FlowFixMe {
    let { error: errorObj } = options;
    if (errorObj == null) {
      errorObj = undefined;
    } else if (typeof errorObj === 'string') {
      errorObj = { message: errorObj, level: 'error' };
    }
    const errorObjFinal = errorObj;
    const doLog = (error?: ?Error) =>
      this.log({
        name: options.name,
        message: options.message,
        level: options.level,
        error:
          errorObjFinal == null
            ? undefined
            : {
                message: errorObjFinal.message,
                error,
                level: errorObjFinal.level,
              },
      });

    try {
      const result = func(this);

      if (result != null && result.then != null) {
        return result
          .then(res => {
            doLog();
            return res;
          })
          .catch(err => {
            doLog(err);
            throw err;
          });
      }

      doLog();
      return result;
    } catch (error) {
      doLog(error);
      throw error;
    }
  }

  logError({
    name,
    message,
    level,
    help,
    metric,
    error,
  }: LogErrorOptions): void {
    let errorLevel = level;
    if (errorLevel == null) {
      errorLevel = 'error';
    } else if (typeof errorLevel === 'object') {
      errorLevel = errorLevel.log;
    }
    this._commonLog({
      name,
      message,
      level: level == null ? 'error' : level,
      help,
      metric:
        metric == null
          ? {
              type: 'counter',
              suffix: 'total',
            }
          : metric,
      error: { error, message, level: errorLevel },
    });
  }

  logErrorSingle({ name, message, level, error }: LogErrorSingleOptions): void {
    let errorLevel = level;
    if (errorLevel == null) {
      errorLevel = 'error';
    } else if (typeof errorLevel === 'object') {
      errorLevel = errorLevel.log;
    }
    this._commonLog({
      name,
      message,
      level: level == null ? 'error' : level,
      error: { error, message, level: errorLevel },
    });
  }

  getCounter(options: MetricOptions): Counter {
    const name = this._getName(options.name);
    if (counters[name] == null) {
      counters[name] = this._metricsFactory.createCounter(
        this._getMetricConstruct(options),
      );
    }

    return counters[name];
  }

  getGauge(options: MetricOptions): Gauge {
    const name = this._getName(options.name);
    if (gauges[name] == null) {
      gauges[name] = this._metricsFactory.createGauge(
        this._getMetricConstruct(options),
      );
    }

    return gauges[name];
  }

  getHistogram(options: MetricOptions): Histogram {
    const name = this._getName(options.name);
    if (histograms[name] == null) {
      histograms[name] = this._metricsFactory.createHistogram(
        this._getMetricConstruct(options),
      );
    }

    return histograms[name];
  }

  getSummary(options: MetricOptions): Summary {
    const name = this._getName(options.name);
    if (summaries[name] == null) {
      summaries[name] = this._metricsFactory.createSummary(
        this._getMetricConstruct(options),
      );
    }

    return summaries[name];
  }

  startSpan({ name, level, help, references: referenceIn }: SpanOptions): Span {
    let span;
    const references = (referenceIn || [])
      .concat([this.childOf(this)])
      .map(reference => {
        if (reference instanceof DefaultReference && reference.isValid()) {
          return reference.getTracerReference(this._tracer);
        }

        return null;
      })
      .filter(Boolean);
    const fullLevel = this._getFullLevel(level);
    if (
      LOG_LEVEL_TO_LEVEL[fullLevel.span] <=
        LOG_LEVEL_TO_LEVEL[this._spanLogLevel] ||
      references.length > 0
    ) {
      let spanLabels = {};
      let spanData = {};
      if (!this.hasSpan()) {
        spanLabels = this._getAllRawLabels(spanLabels);
        spanData = this._getAllRawData(spanData);
      }

      span = this._tracer.startSpan(name, {
        references,
        tags: {
          ...convertTagLabels(spanLabels),
          ...convertTagLabels(spanData),
          component: this._namespace,
        },
      });
    }

    let histogram;
    if (
      LOG_LEVEL_TO_LEVEL[fullLevel.metric] <=
      LOG_LEVEL_TO_LEVEL[this._metricsLogLevel]
    ) {
      histogram = { name: `${name}_duration_seconds`, help };
    }

    return this._clone({
      span: {
        histogram,
        time: this.nowSeconds(),
        span,
      },
    });
  }

  end(error?: boolean): void {
    const span = this.getSpan();
    const { histogram } = span;
    if (histogram != null) {
      const value = this.nowSeconds() - span.time;
      this.getHistogram({
        name: histogram.name,
        help: histogram.help,
        labelNames: [this.labels.ERROR],
      }).observe({ [this.labels.ERROR]: !!error }, value);
    }

    const { span: tracerSpan } = span;
    if (tracerSpan != null) {
      tracerSpan.setTag(this.labels.ERROR, !!error);
      tracerSpan.finish();
    }
  }

  captureSpan(
    func: (span: CaptureMonitor) => $FlowFixMe,
    options: CaptureSpanOptions,
  ): $FlowFixMe {
    const span = this.startSpan({
      name: options.name,
      level: options.level,
      help: options.help,
      references: options.references,
    });
    try {
      const result = func(span);

      if (result != null && result.then != null) {
        return result
          .then(res => {
            span.end();
            return res;
          })
          .catch(err => {
            span.end(true);
            throw err;
          });
      }

      span.end();
      return result;
    } catch (error) {
      span.end(true);
      throw error;
    }
  }

  captureSpanLog(
    func: (span: CaptureMonitor) => $FlowFixMe,
    options: CaptureSpanLogOptions,
  ): $FlowFixMe {
    return this.captureSpan(
      span =>
        span.captureLogSingle(log => func(log), {
          name: options.name,
          level: options.level,
          message: options.message,
          error: options.error == null ? {} : options.error,
        }),
      {
        name: options.name,
        level: options.level,
        help: options.help,
        references: options.references,
      },
    );
  }

  childOf(span: SpanContext | Monitor | void): $FlowFixMe {
    if (span == null) {
      return undefined;
    }
    return (new ChildOfReference((span: $FlowFixMe)): $FlowFixMe);
  }

  followsFrom(span: SpanContext | Monitor | void): $FlowFixMe {
    if (span == null) {
      return undefined;
    }
    return (new FollowsFromReference((span: $FlowFixMe)): $FlowFixMe);
  }

  extract(format: Format, carrier: Carrier): SpanContext | void {
    return this._tracer.extract(format, carrier);
  }

  inject(format: Format, carrier: Carrier): void {
    const span = this._span;
    if (span != null && span.span != null) {
      this._tracer.inject(span.span.context(), format, carrier);
    }
  }

  // eslint-disable-next-line
  serveMetrics(port: number): void {}

  close(callback: () => void): void {
    this._closeInternal()
      .then(() => {
        callback();
      })
      .catch(() => {
        callback();
      });
  }

  setLabels(labels: RawLabels): void {
    this._setSpanLabels(labels);
    this._labels = { ...this._labels, ...labels };
  }

  setData(data: RawLabels): void {
    this._setSpanLabels(data);
    this._data = { ...this._data, ...data };
  }

  hasSpan(): boolean {
    return this._span != null;
  }

  getSpan(): SpanData {
    const span = this._span;
    if (span == null) {
      throw new Error('Programming error: Called end on a regular Monitor.');
    }

    return span;
  }

  _commonLog({
    name,
    message: messageIn,

    level,
    help,
    metric,

    error,
  }: CommonLogOptions): void {
    let labels = {};
    let message = messageIn;
    const fullLevel = this._getFullLevel(level);
    let logLevel = fullLevel.log;
    let metricLevel = LOG_LEVEL_TO_LEVEL[fullLevel.metric];
    if (error != null) {
      labels = { ...labels };
      labels[KNOWN_LABELS.ERROR] = error.error != null;
      const errorLevel = error.level == null ? 'error' : error.level;
      metricLevel = Math.min(metricLevel, LOG_LEVEL_TO_LEVEL[errorLevel]);
      const { error: errorObj } = error;
      if (errorObj != null) {
        logLevel = errorLevel;
        const { message: errorMessage } = error;
        if (errorMessage == null) {
          message = errorMessage;
        } else {
          const dot = errorMessage.endsWith('.') ? '' : '.';
          message = `${errorMessage}${dot} ${errorObj.message}`;
        }
      }
    }

    if (
      metricLevel <= LOG_LEVEL_TO_LEVEL[this._metricsLogLevel] &&
      metric != null
    ) {
      const metricName = `${name}_${metric.suffix}`;
      if (metric.type === 'counter') {
        this.getCounter({
          name: metricName,
          help,
          labelNames: Object.keys(labels),
        }).inc(labels);
      } else {
        const value = metric.value == null ? 1 : metric.value;
        if (metric.type === 'gauge') {
          this.getGauge({
            name: metricName,
            help,
            labelNames: Object.keys(labels),
          }).set(labels, value);
        } else if (metric.type === 'histogram') {
          this.getHistogram({
            name: metricName,
            help,
            labelNames: Object.keys(labels),
          }).observe(labels, value);
        } else {
          this.getSummary({
            name: metricName,
            help,
            labelNames: Object.keys(labels),
          }).observe(labels, value);
        }
      }
    }

    // Gather up all information for logging
    this._logger.log({
      name: this._getName(name),
      level: logLevel,
      message,
      labels: convertMetricLabels(this._getAllRawLabels(labels)),
      data: convertMetricLabels(this._getAllRawData()),
      error: error == null ? undefined : error.error,
    });

    const { span: tracerSpan } = this._span || {};
    if (
      LOG_LEVEL_TO_LEVEL[fullLevel.span] <=
        LOG_LEVEL_TO_LEVEL[this._spanLogLevel] &&
      tracerSpan != null
    ) {
      const spanLog = ({
        event: name,
        message,
        labels: convertMetricLabels(labels),
      }: Object);
      if (error != null) {
        const { error: errorObj } = error;
        if (errorObj != null) {
          spanLog['error.kind'] =
            (errorObj: $FlowFixMe).code == null
              ? errorObj.constructor.name
              : (errorObj: $FlowFixMe).code;
          spanLog['error.object'] = errorObj;
          spanLog.stack = errorObj.stack;
        }
      }
      // Only log information from the current point in time
      tracerSpan.log(spanLog);
    }
  }

  _getMetricConstruct({
    name,
    help,
    labelNames,
  }: MetricOptions): MetricConstruct {
    return {
      name: this._getName(name),
      help,
      labelNames: this._getLabelNames(labelNames),
      metricLabels: convertMetricLabels(this._labels),
    };
  }

  _getName(name: string): string {
    return `${this._namespace}_${name}`;
  }

  _getLabelNames(labelNames?: Array<string>): Array<string> {
    return Object.keys(this._labels).concat(labelNames || []);
  }

  _getAllRawLabels(labels?: RawLabels): RawLabels {
    if (labels == null) {
      return this._labels;
    }

    return { ...this._labels, ...labels };
  }

  _getAllRawData(labels?: RawLabels): RawLabels {
    if (labels == null) {
      return this._data;
    }

    return { ...this._data, ...labels };
  }

  _setSpanLabels(labels: RawLabels): void {
    const span = this.getSpan();
    const { span: tracerSpan } = span;
    if (tracerSpan != null) {
      const tagLabels = convertTagLabels(labels);
      for (const key of Object.keys(tagLabels)) {
        if (tagLabels[key] != null) {
          tracerSpan.setTag(key, tagLabels[key]);
        }
      }
    }
  }

  _getFullLevel(levelIn?: LogLevelOption): FullLogLevelOption {
    let level = levelIn;
    if (level == null) {
      level = 'info';
    }

    if (typeof level === 'string') {
      return {
        log: level,
        metric: level,
        span: level,
      };
    }

    return {
      log: level.log,
      metric: level.metric == null ? level.log : level.metric,
      span: level.span == null ? level.log : level.span,
    };
  }

  _clone({
    namespace,
    mergeLabels,
    mergeData,
    span,
  }: {|
    namespace?: string,
    mergeLabels?: Labels,
    mergeData?: Labels,
    span?: SpanData,
  |}) {
    let mergedLabels = this._labels;
    if (mergeLabels != null) {
      mergedLabels = { ...this._labels, ...mergeLabels };
    }

    let mergedData = this._data;
    if (mergeData != null) {
      mergedData = { ...this._labels, ...mergeData };
    }

    return new this.constructor({
      namespace: namespace == null ? this._namespace : namespace,
      logger: this._logger,
      tracer: this._tracer,
      now: this.now,
      labels: mergedLabels,
      data: mergedData,
      span: span == null ? this._span : span,
      metricsLogLevel: this._metricsLogLevel,
      spanLogLevel: this._spanLogLevel,
      metricsFactory: this._metricsFactory,
    });
  }

  async _closeInternal(): Promise<void> {
    await Promise.all([
      new Promise(resolve => {
        this._logger.close(() => resolve());
      }),
      new Promise(resolve => {
        this._tracer.close(() => resolve());
      }),
    ]);
  }
}
