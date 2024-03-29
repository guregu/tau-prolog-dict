import pl from "tau-prolog";

// ugly code alert!
// work in progress

const predicates: Record<string, pl.type.PredicateFn> = {
	"is_dict/1": is_dict1,
	"dict_create/3": dict_create3,
	"dict_pairs/3": dict_pairs3,
	"get_dict/3": get_dict3,
	"put_dict/3": put_dict3,
	"put_dict/4": put_dict4,
	"del_dict/4": del_dict4,
	"select_dict/3": select_dict3,
	":</2": projectLeft,
	">:</2": projectBoth,
	"atom_json_dict/3": atom_json_dict3,
}

export default function(pl2: typeof pl) {
	new pl2.type.Module("dict", predicates, Object.keys(predicates), {dependencies: ["js"]});

	pl2.type.is_dict = function(obj) {
		return (obj instanceof pl2.type.Dict) || (
			pl2.type.is_term(obj) && obj.args.length === 1 && 
			pl2.type.is_term(obj.args[0]) &&  obj.args[0].indicator === "{}/1"
		);
	};

	pl2.type.Dict = Dict;
	pl2.type.order.push( pl2.type.Dict );

	// hack to json marshal dicts
	const term2js = pl2.type.Term.prototype.toJavaScript;
	pl2.type.Term.prototype.toJavaScript = function() {
		if (pl2.type.is_dict(this)) {
			return new Dict(mapify(this)).toJavaScript();
		}
		return term2js.apply(this, arguments);
	};
}

export class Dict {
	map: Record<string, pl.type.Value>;
	tag = "&"; // TODO: make Var by default, add to constructor
	id = this.tag;
	indicator = this.id + "{}/1";
	ground: boolean;

	public constructor(map = {}) {
		this.map = map;
		this.ground = isGround(map);
	}

	unify(obj: pl.type.Value, occurs_check: boolean) {
		// const y = (obj as unknown as Dict).map;
		const y = mapify(obj);
		if (!y) {
			return null;
		}
		const x = Object.entries(this.map);
		const y_keys = Object.keys(y);
		if (x.length !== y_keys.length) {
			return null;
		}
		let sub = new pl.type.Substitution();
		for (const [k, v_x] of x) {
			const v_y = y[k];
			if (!v_y) {
				return null;
			}
			const member = pl.unify(v_x.apply(sub), v_y.apply(sub), occurs_check);
			if(member === null) {
				return null;
			}
			for (const x in member.links) {
				sub.links[x] = member.links[x];
			}
			sub = sub.apply(member);
		}
		return sub;
	}

	project_(obj: pl.type.Value, left: boolean, rest?: Dict) {
		const occurs_check = false;
		const x = Object.entries(this.map);
		const y = mapify(obj);
		if (!y) {
			return null;
		}
		let sub = new pl.type.Substitution();
		if (left) {
			for (const [k, v_x] of x) {
				const v_y = y[k];
				if (!v_y) {
					if (rest) {
						rest.map[k] = v_x;
					}
					continue;
				}
				const member = pl.unify(v_x.apply(sub), v_y.apply(sub), occurs_check);
				if(member === null) {
					continue;
				}
				for (const x in member.links) {
					sub.links[x] = member.links[x];
				}
				sub = sub.apply(member);
			}
		}
		for (const [k, v_y] of Object.entries(y)) {
			const v_x = this.map[k];
			if (left && typeof v_x !== "undefined") {
				continue;
			}
			if (!v_x) {
				if (rest) {
					rest.map[k] = v_y;
				}
				continue;
			}
			const member = pl.unify(v_x.apply(sub), v_y.apply(sub), occurs_check);
			if(member === null) {
				continue;
			}
			for (const x in member.links) {
				sub.links[x] = member.links[x];
			}
			sub = sub.apply(member);
		}
		// TODO:
		this.changed();
		if (obj.changed) {
			obj.changed();
		};
		if (rest && rest.changed) {
			rest.changed();
		}
		return sub;
	}

	// toString
	toString(options?: any) {
		// TODO: don't create term here
		return `${this.tag}{${Object.entries(this.map).map(([k, v]) => `${new pl.type.Term(k).toString(options)}: ${v.toString(options)}`)}}`;
	};

	// clone
	clone() {
		const cloned = Object.entries(this.map).map(([k, v]) => [k, v.clone()]);
		return new Dict(Object.fromEntries(cloned));
	};

	equals(obj) {
		// TODO
		return obj === this;
		// return pl.type.is_js_object( obj ) && this.value === obj.value;
	};

	// rename
	rename(thread: pl.type.Thread) {
		// TODO: ground check
		const renamed = Object.entries(this.map).map(([k, v]) => [k, v.rename(thread)]);
		return new Dict(Object.fromEntries(renamed));
	};

	// get variables
	variables() {
		return Object.values(this.map).flatMap(v => v.variables());
	};

	// apply substitutions
	apply(subs: pl.type.Substitution) {
		if (this.ground) {
			return this;
		}
		const applied = Object.entries(this.map).map(([k, v]) => [k, v.apply(subs)]);
		return new Dict(Object.fromEntries(applied));
	};

	compare(obj: Dict) {
		if (this.equals(obj)) {
			return 0;
		}
		if (this.tag > obj.tag) {
			return 1;
		}
		if (this.tag < obj.tag) {
			return -1;
		}
		const k0 = Object.keys(this.map);
		const k1 = Object.keys(obj.map);
		if (k0.length > k1.length) {
			return 1;
		} 
		if (k0.length < k0.length) {
			return -1;
		}
		for (let i = 0; i < k0.length; i++) {
			const x = k0[i];
			const y = k1[i];
			if (x > y) {
				return 1;
			}
			if (x < y) {
				return -1;
			}
		}
		return 0;
	}

	toJavaScript() {
		const jsed = Object.entries(this.map).map(([k, v]) => {
			// if (pl.type.is_dict(v) && !(v instanceof Dict)) {
			// 	return [k, new Dict(mapify(v)).toJavaScript()]; // hack
			// }
			if (pl.type.is_term(v) && v.indicator === "@/1" && pl.type.is_atom(v.args[0])) {
				switch (v.args[0].indicator) {
				case "true/0":
					return [k, true];
				case "false/0":
					return [k, false];
				case "null/0":
					return [k, null];
				case "undefined/0":
					return [k, undefined];
				}
			}
			return [k, v.toJavaScript()];
		});
		return Object.fromEntries(jsed);
	}

	// not sure what this is for
	interpret(indicator: string) {
		return pl.error.instantiation( indicator );
	}

	public changed() {
		this.ground = isGround(this.map);
	}
}


function isGround(obj) {
	const variable = Object.values(obj).find((x: {ground?: boolean}) => x.hasOwnProperty("ground") && x.ground === false);
	return typeof variable === "undefined";
}

function mapify(term: pl.type.Term<number, string>): Record<string, pl.type.Value> | undefined {
	const map = {};
	if (term instanceof Dict) {
		return term.map;
	}
	if (!pl.type.is_term(term) || term.args.length != 1 || term.args[0].indicator !== "{}/1") {
		return;
	}
	const obj = term.args[0];
	if (pl.type.is_term(obj) && obj.indicator === "{}/1") {
		let pointer = obj.args[0];
		const props = [];
		while (pl.type.is_term(pointer) && pointer.indicator === ",/2") {
			props.push(pointer.args[0]);
			pointer = pointer.args[1];
		}
		props.push(pointer);
		for (let i = 0; i < props.length; i++) {
			const bind = props[i];
			if(!pl.type.is_term(bind) || bind.indicator !== ":/2") {
				return;
			}
			const name = bind.args[0];
			if(!pl.type.is_atom(name)) {
				return;
			}
			map[name.id] = bind.args[1];
		}
		return map;
	}
}

function is_dict1(thread: pl.type.Thread, point: pl.type.State, atom: pl.type.Term<number, string>) {
	const dict = atom.args[0];
	// TODO: check term dict
	if (pl.type.is_dict(dict)) {
		thread.success(point);
	}
}

// dict_create(-Dict, +Tag, +Data)
function dict_create3(thread: pl.type.Thread, point: pl.type.State, atom: pl.type.Term<number, string>) {
	const dict = atom.args[0];
	const tag = atom.args[1];
	if (!pl.type.is_atom(tag)) {
		thread.throw_error(pl.error.type("atom", tag, "dict_create/3"));
		return;
	}
	let ptr = atom.args[2];
	const map = mapifyList(thread, atom, ptr);
	const newDict = new Dict(map);
	thread.prepend([new pl.type.State(
		point.goal.replace(new pl.type.Term("=", [dict, newDict])),
		point.substitution,
		point
	)]);
}

function mapifyList(thread: pl.type.Thread, atom: pl.type.Term<number, string>, ptr: pl.type.Term<number, string>) {
	if (!pl.type.is_list(ptr)) {
		thread.throw_error(pl.error.type("list", ptr, "dict_create/3"));
		return;
	}
	const map: Record<string, pl.type.Value> = {};
	while(pl.type.is_term(ptr) && ptr.indicator === "./2" ) {
		const pair = ptr.args[0];
		if (!pl.type.is_term(pair) || pair.indicator !== "-/2") {
			thread.throw_error(pl.error.type("pair", pair, "dict_create/3"));
			return;
		}
		const key = pair.args[0];
		if (!pl.type.is_atom(key)) {
			thread.throw_error(pl.error.type("atom", key, "dict_create/3"));
			return;
		}
		const val = pair.args[1];
		map[key.id] = val;
		ptr = ptr.args[1];
	}
	return map;
}

function listifyDict(thread: pl.type.Thread, atom: pl.type.Term<number, string>, dict) {
	if (!(dict instanceof Dict)) {
		dict = new Dict(mapify(dict));
	}
	const pairs = Object.entries(dict.map).map(([k, v]) => new pl.type.Term("-", [new pl.type.Term(k), v]));
	return makeList(pairs);
}

function dict_pairs3(thread: pl.type.Thread, point: pl.type.State, atom: pl.type.Term<number, string>) {
	const dict = atom.args[0];
	//const tag = atom.args[1]; // TODO: unused
	const pairs = atom.args[2];

	if (pl.type.is_list(pairs)) {
		const map = mapifyList(thread, atom, pairs);
		if (!map) {
			return;
		}
		const newDict = new Dict(map);
		thread.prepend([new pl.type.State(
			point.goal.replace(new pl.type.Term("=", [dict, newDict])),
			point.substitution,
			point
		)]);
		return;
	}

	if (pl.type.is_variable(dict)) {
		thread.throw_error(pl.error.instantiation(atom.indicator));
		return;
	}
	if (!pl.type.is_dict(dict)) {
		thread.throw_error(pl.error.type("dict", dict, atom.indicator));
		return;
	}
	const list = listifyDict(thread, atom, dict);
	thread.prepend([new pl.type.State(
		point.goal.replace(new pl.type.Term("=", [pairs, list])),
		point.substitution,
		point
	)]);
	return;
}

// get_dict(?Key, +Dict, -Value)
function get_dict3(thread: pl.type.Thread, point: pl.type.State, atom: pl.type.Term<number, string>) {
	const key = atom.args[0];
	const dict = atom.args[1];
	if (pl.type.is_variable(dict)) {
		thread.throw_error(pl.error.instantiation(atom.indicator));
		return;
	}
	const value = atom.args[2];
	if (pl.type.is_atom(key)) {
		const v = mapify(dict)[key.id];
		if (!v) {
			return;
		}
		thread.prepend([new pl.type.State(
			point.goal.replace(new pl.type.Term("=", [value, v])),
			point.substitution,
			point
		)]);
		return;
	};
	if (pl.type.is_variable(key)) {
		thread.prepend(Object.entries(dict.map).map(([k, v]) => {
			return new pl.type.State(
				point.goal.replace(
					new pl.type.Term(",", [
						new pl.type.Term("=", [key, new pl.type.Term(k)]),
						new pl.type.Term("=", [value, v]),
					])
				),
				point.substitution,
				point
			)
		}));
		return;
	}
	thread.throw_error(pl.error.type("atom", key, atom.indicator));
}


// put_dict(+New, +DictIn, -DictOut)
function put_dict3(thread: pl.type.Thread, point: pl.type.State, atom: pl.type.Term<number, string>) {
	const put = atom.args[0];
	if (pl.type.is_variable(put)) {
		thread.throw_error(pl.error.instantiation(atom.indicator));
	}
	if (!pl.type.is_dict(put)) {
		thread.throw_error(pl.error.type("dict", put, atom.indicator));
		return;
	}
	const dict = atom.args[1];
	if (pl.type.is_variable(dict)) {
		thread.throw_error(pl.error.instantiation(atom.indicator));
		return;
	}
	if (!pl.type.is_dict(dict)) {
		thread.throw_error(pl.error.type("dict", dict, atom.indicator));
		return;
	}
	const copy = dict.clone() as unknown as Dict;
	for (const [k, v] of Object.entries(put.map)) {
		copy.map[k] = v;
	}
	copy.changed();
	const value = atom.args[2];
	thread.prepend([new pl.type.State(
		point.goal.replace(new pl.type.Term("=", [value, copy])),
		point.substitution,
		point
	)]);
	return;
}

// put_dict(+Key, +DictIn, +Value, -DictOut)
function put_dict4(thread: pl.type.Thread, point: pl.type.State, atom: pl.type.Term<number, string>) {
	const key = atom.args[0];
	if (pl.type.is_variable(key)) {
		thread.throw_error(pl.error.instantiation("put_dict/4"));
	}
	if (!pl.type.is_atom(key)) {
		thread.throw_error(pl.error.type("atom", key, "put_dict/4"));
		return;
	}
	const dict = atom.args[1] as unknown as Dict;
	if (pl.type.is_variable(dict)) {
		thread.throw_error(pl.error.instantiation("put_dict/4"));
		return;
	}
	if (!pl.type.is_dict(dict)) {
		thread.throw_error(pl.error.type("dict", dict, "put_dict/4"));
		return;
	}
	const value = atom.args[2];
	const next = new Dict({...dict.map, [key.id]: value});
	const out = atom.args[3];
	thread.prepend([new pl.type.State(
		point.goal.replace(new pl.type.Term("=", [out, next])),
		point.substitution,
		point
	)]);
	return;
}

// del_dict(+Key, +DictIn, +Value, -DictOut)
function del_dict4(thread: pl.type.Thread, point: pl.type.State, atom: pl.type.Term<number, string>) {
	const key = atom.args[0];
	if (pl.type.is_variable(key)) {
		thread.throw_error(pl.error.instantiation("put_dict/4"));
	}
	if (!pl.type.is_atom(key)) {
		thread.throw_error(pl.error.type("atom", key, "put_dict/4"));
		return;
	}
	const dict = atom.args[1] as unknown as Dict;
	if (pl.type.is_variable(dict)) {
		thread.throw_error(pl.error.instantiation("put_dict/4"));
		return;
	}
	if (!pl.type.is_dict(dict)) {
		thread.throw_error(pl.error.type("dict", dict, "put_dict/4"));
		return;
	}
	const value = atom.args[2];
	const next = dict.clone();
	const old = next.map[key.id];
	delete next.map[key.id];
	next.changed();
	const out = atom.args[3];
	const unify = old ? new pl.type.Term(",", [new pl.type.Term("=", [out, next]), new pl.type.Term("=", [value, old])]) : new pl.type.Term("=", [out, next]);
	thread.prepend([new pl.type.State(
		point.goal.replace(unify),
		point.substitution,
		point
	)]);
	return;
}

// select_dict(+Select, +From, -Rest)
function select_dict3(thread: pl.type.Thread, point: pl.type.State, atom: pl.type.Term<number, string>) {
	const dict0 = atom.args[0];
	const dict1 = atom.args[1];
	if (pl.type.is_variable(dict0) || pl.type.is_variable(dict1)) {
		thread.throw_error(pl.error.instantiation(">:/2"));
		return;
	}
	if (!pl.type.is_dict(dict0)) {
		thread.throw_error(pl.error.type("dict", dict0, ">:/2"));
		return;
	}
	if (!pl.type.is_dict(dict1)) {
		thread.throw_error(pl.error.type("dict", dict1, ">:/2"));
		return;
	}
	const out = atom.args[2];
	const rest = new Dict();
	const sub: pl.type.Substitution | null = dict0.project_(dict1, false, rest);
	if (!sub) {
		return;
	}
	thread.prepend([new pl.type.State(
		point.goal.apply(sub).replace(new pl.type.Term("=", [out, rest])),
		point.substitution.apply(sub),
		point
	)]);
	return;
}

// +Project >: +Dict.
function projectLeft(thread: pl.type.Thread, point: pl.type.State, atom: pl.type.Term<number, string>) {
	const dict0 = atom.args[0];
	const dict1 = atom.args[1];
	if (pl.type.is_variable(dict0) || pl.type.is_variable(dict1)) {
		thread.throw_error(pl.error.instantiation(">:/2"));
		return;
	}
	if (!pl.type.is_dict(dict0)) {
		thread.throw_error(pl.error.type("dict", dict0, ">:/2"));
		return;
	}
	if (!pl.type.is_dict(dict1)) {
		thread.throw_error(pl.error.type("dict", dict1, ">:/2"));
		return;
	}
	const sub: pl.type.Substitution | null = dict0.project_(dict1, false);
	if (!sub) {
		return;
	}
	thread.prepend([new pl.type.State(
		point.goal.apply(sub).replace(null),
		point.substitution.apply(sub),
		point
	)]);
	return;
}

// +Dict1 >:< +Dict2
function projectBoth(thread: pl.type.Thread, point: pl.type.State, atom: pl.type.Term<number, string>) {
	const dict0 = atom.args[0];
	const dict1 = atom.args[1];
	if (pl.type.is_variable(dict0) || pl.type.is_variable(dict1)) {
		thread.throw_error(pl.error.instantiation(">:</2"));
		return;
	}
	if (!pl.type.is_dict(dict0)) {
		thread.throw_error(pl.error.type("dict", dict0, ">:</2"));
		return;
	}
	if (!pl.type.is_dict(dict1)) {
		thread.throw_error(pl.error.type("dict", dict1, ">:</2"));
		return;
	}
	const sub: pl.type.Substitution | null = dict0.project_(dict1, true);
	if (!sub) {
		return;
	}
	thread.prepend([new pl.type.State(
		point.goal.apply(sub).replace(null),
		point.substitution.apply(sub),
		point
	)]);
	return;
}

function atom_json_dict3_obj_(thread: pl.type.Thread, atom: pl.type.Term<number, string>, dict: unknown): unknown {
	if (pl.type.is_variable(dict)) {
		thread.throw_error(pl.error.instantiation(atom.indicator));
		return;
	}

	if (pl.type.is_list(dict)) {
		let obj = [];
		let ptr = dict as pl.type.Term<number, string>;
		while(pl.type.is_term(ptr) && ptr.indicator === "./2" ) {
			const elem = atom_json_dict3_obj_(thread, atom, ptr.args[0]);
			if (!elem) {
				return; // threw
			}
			obj.push(elem)
			ptr = ptr.args[1];
		}
		return obj;
	} else if (!pl.type.is_dict(dict)) {
		thread.throw_error(pl.error.type("dict", dict, atom.indicator));
		return;
	} else {
		if (!(dict instanceof Dict)) {
			dict = new Dict(mapify(dict));
		}
		return (dict as pl.type.Value).toJavaScript();
	}
}

// atom_json_dict(+Atom, -JSONDict, +Options).
// atom_json_dict(-Text, +JSONDict, +Options).
function atom_json_dict3(thread: pl.type.Thread, point: pl.type.State, atom: pl.type.Term<number, string>) {
	const text = atom.args[0];
	let dict = atom.args[1];
	// const opts = atom.args[2];
	if (pl.type.is_variable(text)) {
		// TODO: check ground?
		const obj = atom_json_dict3_obj_(thread, atom, dict);
		if (!obj) {
			return; // threw
		}
		const json = new pl.type.Term(JSON.stringify(obj));
		thread.prepend([new pl.type.State(
			point.goal.replace(new pl.type.Term("=", [text, json])),
			point.substitution,
			point
		)]);
		return;
	}
	if (!pl.type.is_atom(text)) {
		thread.throw_error(pl.error.type("atom", text, atom.indicator));
		return;
	}
	let decoded;
	try {
		decoded = JSON.parse(text.id, reviver); // TODO: string support?
	} catch (err) {
		thread.throw_error(pl.error.javascript(err.toString(), atom.indicator));
		return;
	}
	if (!decoded) {
		thread.throw_error(new pl.type.Term("???? TODO"));
		return;
	}
	thread.prepend([new pl.type.State(
		point.goal.replace(new pl.type.Term("=", [dict, decoded])),
		point.substitution,
		point
	)]);
	return;
}

function reviver(k: string, v: any): any {
	if (typeof v !== "object") {
		return pl.fromJavaScript.apply(v);
	}
	if (pl.type.is_term(v) || pl.type.is_number(v) || pl.type.is_dict(v)) {
		return v;
	}
	if (Array.isArray(v)) {
		return makeList(v.map((x, i) => reviver(String(i), x)))
	}
	return new Dict(
		Object.fromEntries(Object.entries(v).map(([k, v]) => [k, reviver("", v)]))
	);
}

function makeList(array: pl.type.Value[] = [], cons = new pl.type.Term("[]", [])) {
	let list = cons;
	for (let i = array.length - 1; i >= 0; i--) {
		list = new pl.type.Term(".", [array[i], list]);
	}
	return list;
}