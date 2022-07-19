# library(dict)

Adds a dictionary type to [Tau Prolog](https://github.com/tau-prolog/tau-prolog) based on SWI Prolog's dictionary type.

Experimental.

## Predicates

Supports most of the same predicates as SWI. Does not support functional syntax. 

Note that this package doesn't support the `tag{}` syntax for dictionaries. You have to use `dict_create/3` to make one.

See: https://www.swi-prolog.org/pldoc/man?section=ext-dict-predicates

### atom_json_dict/3

Transforms dictionaries to JSON atoms and vice versa. Options aren't supported yet.

See: https://www.swi-prolog.org/pldoc/doc_for?object=atom_json_dict/3