import { RequestContext } from '../types/context';

export class BaseService {
  protected context: RequestContext;
  
  constructor(context: RequestContext) {
    this.context = context;
  }
} 